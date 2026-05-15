"""Tic Tac Toe — minimax AI agent and ReAct agent endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.core.dependencies import get_current_user
from app.models.user import User
from app.ai.agents import create_tictactoe_agent

router = APIRouter(prefix="/api/tictactoe", tags=["tictactoe"])

Board = list[str | None]  # 9 cells: "X", "O", or None
_VALID_MARKS = {None, "X", "O"}


def _validate_board_state(board: Board) -> None:
    """Ensure board is a legal game state."""
    if len(board) != 9:
        raise HTTPException(status_code=422, detail={"error": "invalid_board", "message": "Board must have exactly 9 cells."})
    for cell in board:
        if cell not in _VALID_MARKS:
            raise HTTPException(status_code=422, detail={"error": "invalid_cell", "message": f"Invalid cell value: {cell!r}. Must be 'X', 'O', or null."})
    x_count = board.count("X")
    o_count = board.count("O")
    # Valid states: X == O (agent's turn to move) or X == O+1 (X just moved)
    if not (x_count == o_count or x_count == o_count + 1):
        raise HTTPException(status_code=422, detail={"error": "invalid_turn", "message": "Invalid board: X and O counts indicate an impossible game state."})


def _winner(board: Board) -> str | None:
    lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ]
    for a, b, c in lines:
        if board[a] and board[a] == board[b] == board[c]:
            return board[a]
    return None


def _describe_board(board: Board) -> str:
    """Convert board list to readable ASCII representation."""
    if len(board) != 9:
        return "Invalid board"

    grid = []
    for i in range(3):
        row = []
        for j in range(3):
            idx = i * 3 + j
            cell = board[idx]
            row.append(cell if cell else str(idx))
        grid.append(" | ".join(row))

    ascii_board = "\n---------\n".join(grid)
    return f"Board positions (0-8):\n{ascii_board}"


def _minimax(board: Board, is_maximizing: bool) -> int:
    w = _winner(board)
    if w == "O":
        return 1
    if w == "X":
        return -1
    if all(c is not None for c in board):
        return 0

    if is_maximizing:
        best = -10
        for i in range(9):
            if board[i] is None:
                board[i] = "O"
                best = max(best, _minimax(board, False))
                board[i] = None
        return best
    else:
        best = 10
        for i in range(9):
            if board[i] is None:
                board[i] = "X"
                best = min(best, _minimax(board, True))
                board[i] = None
        return best


def _best_move(board: Board) -> int:
    best_score = -10
    move = -1
    for i in range(9):
        if board[i] is None:
            board[i] = "O"
            score = _minimax(board, False)
            board[i] = None
            if score > best_score:
                best_score = score
                move = i
    return move


class MoveRequest(BaseModel):
    board: list[str | None]  # 9 cells

    @field_validator("board")
    @classmethod
    def board_must_be_nine(cls, v: list[str | None]) -> list[str | None]:
        if len(v) != 9:
            raise ValueError("Board must have exactly 9 cells.")
        for cell in v:
            if cell not in _VALID_MARKS:
                raise ValueError(f"Invalid cell value: {cell!r}.")
        return v


class MoveResponse(BaseModel):
    board: list[str | None]
    move: int
    winner: str | None
    draw: bool


class AgentMoveResponse(BaseModel):
    board: list[str | None]
    move: int
    winner: str | None
    draw: bool
    reasoning: str = ""  # Agent's thought process


@router.post("/move", response_model=MoveResponse)
async def agent_move(
    req: MoveRequest,
    _: User = Depends(get_current_user),
) -> MoveResponse:
    _validate_board_state(req.board)
    board = req.board[:]
    move = _best_move(board)
    if move != -1:
        board[move] = "O"
    winner = _winner(board)
    draw = winner is None and all(c is not None for c in board)
    return MoveResponse(board=board, move=move, winner=winner, draw=draw)


# ──────────────────────────────────────────────────────────────
# Project 11: ReAct Agent with LiteLLM
# ──────────────────────────────────────────────────────────────

_agent_executor = None
_agent_error = None


def _get_agent():
    """Lazy-load agent executor (initialized once)."""
    global _agent_executor, _agent_error
    if _agent_executor is None and _agent_error is None:
        try:
            _agent_executor = create_tictactoe_agent()
        except Exception as e:
            _agent_error = str(e)
    
    if _agent_error:
        raise ValueError(_agent_error)
    
    return _agent_executor


@router.post("/move-agent", response_model=AgentMoveResponse)
async def agent_move_llm(
    req: MoveRequest,
) -> AgentMoveResponse:
    """
    AI agent move using ReAct pattern with LiteLLM integration.
    
    Agent analyzes board state and chooses move based on:
    1. Winning strategy
    2. Defensive blocking
    3. Strategic positioning (center > corners > edges)
    """
    _validate_board_state(req.board)
    
    # Try to get agent executor
    try:
        executor = _get_agent()
    except ValueError as config_error:
        # LLM not configured - use minimax fallback
        board = req.board[:]
        move = _best_move(board)
        if move != -1:
            board[move] = "O"
        winner = _winner(board)
        draw = winner is None and all(c is not None for c in board)
        return AgentMoveResponse(
            board=board,
            move=move,
            winner=winner,
            draw=draw,
            reasoning=f"⚙️ Agent mode unavailable: {str(config_error)}. Using strategic minimax algorithm instead.",
        )
    
    # Prepare board description for agent
    board_desc = _describe_board(req.board)
    
    # Run agent reasoning and move selection
    try:
        result = executor.invoke({
            "messages": [
                (
                    "user",
                    f"Current board state:\n{board_desc}\n\nAnalyze the board and make your optimal move.",
                )
            ],
        })
    except Exception as e:
        # Fallback to minimax if agent fails
        error_str = str(e)
        
        # Provide more specific error messages
        if "401" in error_str:
            error_msg = "API authentication failed (check LLM credentials)"
        elif "key not allowed" in error_str.lower():
            error_msg = "LLM API key doesn't have permission for this model"
        elif "timeout" in error_str.lower():
            error_msg = "LLM service timeout"
        else:
            error_msg = error_str[:80]
        
        board = req.board[:]
        move = _best_move(board)
        if move != -1:
            board[move] = "O"
        winner = _winner(board)
        draw = winner is None and all(c is not None for c in board)
        return AgentMoveResponse(
            board=board,
            move=move,
            winner=winner,
            draw=draw,
            reasoning=f"🔧 Agent unavailable ({error_msg}). Using strategic minimax algorithm.",
        )
    
    # Extract agent reasoning from final AI message.
    reasoning = ""
    if "messages" in result and result["messages"]:
        for message in reversed(result["messages"]):
            content = getattr(message, "content", "")
            if isinstance(content, str) and content.strip():
                reasoning = content
                break
    
    # Try to extract the board state from the agent's last action
    final_board = req.board[:]
    move_position = -1
    
    # Parse tool call arguments first.
    if "messages" in result:
        for message in result["messages"]:
            if hasattr(message, "tool_calls"):
                for tool_call in message.tool_calls:
                    if tool_call.get("name") == "make_move":
                        args = tool_call.get("args", {})
                        if isinstance(args, dict):
                            move_position = args.get("position", -1)
                            if 0 <= move_position <= 8 and req.board[move_position] is None:
                                final_board = req.board[:]
                                final_board[move_position] = "O"
                                break
    
    # Fallback: Try to parse position from reasoning text
    if move_position == -1:
        import re
        patterns = [r"position\s+(\d)", r"move\s+(\d)", r"\[(\d)\]", r"^(\d)$"]
        for pattern in patterns:
            match = re.search(pattern, reasoning, re.IGNORECASE)
            if match:
                move_position = int(match.group(1))
                if 0 <= move_position <= 8 and req.board[move_position] is None:
                    final_board = req.board[:]
                    final_board[move_position] = "O"
                    break
    
    # Final fallback to minimax if agent didn't make valid move
    if move_position == -1 or final_board == req.board:
        move_position = _best_move(req.board[:])
        final_board = req.board[:]
        if move_position != -1:
            final_board[move_position] = "O"
        reasoning = f"{reasoning}\n[Fallback: Agent couldn't extract move, using minimax at position {move_position}]"
    
    # Check game state
    winner = _winner(final_board)
    draw = winner is None and all(c is not None for c in final_board)
    
    return AgentMoveResponse(
        board=final_board,
        move=move_position,
        winner=winner,
        draw=draw,
        reasoning=reasoning,
    )
