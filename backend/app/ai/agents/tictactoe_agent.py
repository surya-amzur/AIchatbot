"""Tic Tac Toe ReAct Agent with local in-app tools."""
from __future__ import annotations

from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from app.core.config import settings


class TicTacToeGameLogic:
    """Pure Tic Tac Toe game logic used by local agent tools."""

    @staticmethod
    def _normalize_cell(cell):
        if cell is None or cell == "X" or cell == "O":
            return cell
        if isinstance(cell, str):
            upper = cell.strip().upper()
            return upper if upper in {"X", "O"} else None
        if isinstance(cell, dict):
            for key in ("value", "mark", "cell", "symbol"):
                if key in cell:
                    return TicTacToeGameLogic._normalize_cell(cell[key])
        return None

    @staticmethod
    def _normalize_board(board: list) -> list:
        if not isinstance(board, list):
            return []
        normalized = [TicTacToeGameLogic._normalize_cell(cell) for cell in board[:9]]
        if len(normalized) < 9:
            normalized.extend([None] * (9 - len(normalized)))
        return normalized

    @staticmethod
    def validate_board(board: list) -> bool:
        if not isinstance(board, list):
            return False
        board = TicTacToeGameLogic._normalize_board(board)
        if len(board) != 9:
            return False
        for cell in board:
            if cell not in {None, "X", "O"}:
                return False
        x_count = board.count("X")
        o_count = board.count("O")
        return x_count == o_count or x_count == o_count + 1

    @staticmethod
    def get_legal_moves(board: list) -> list[int]:
        if not isinstance(board, list):
            return []
        board = TicTacToeGameLogic._normalize_board(board)
        if len(board) != 9:
            return []
        return [i for i, cell in enumerate(board) if cell is None]

    @staticmethod
    def describe_board(board: list) -> str:
        if not isinstance(board, list):
            return "Invalid board"
        board = TicTacToeGameLogic._normalize_board(board)
        if len(board) != 9:
            return "Invalid board"

        grid = []
        for i in range(3):
            row = []
            for j in range(3):
                idx = i * 3 + j
                cell = board[idx]
                row.append(str(cell) if cell else str(idx))
            grid.append(" | ".join(row))

        ascii_board = "\n---------\n".join(grid)
        return f"Board positions (0-8):\n{ascii_board}"

    @staticmethod
    def check_winner(board: list) -> str | None:
        if not isinstance(board, list):
            return None
        board = TicTacToeGameLogic._normalize_board(board)
        if len(board) != 9:
            return None

        lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6],
        ]
        for a, b, c in lines:
            if board[a] and board[a] == board[b] == board[c]:
                return board[a]
        return None

    @staticmethod
    def make_move(board: list, position: int) -> dict:
        if not isinstance(board, list):
            return {"success": False, "error": "Invalid board state"}
        board = TicTacToeGameLogic._normalize_board(board)
        if len(board) != 9:
            return {"success": False, "error": "Invalid board state"}
        if not isinstance(position, int) or position < 0 or position > 8:
            return {"success": False, "error": f"Invalid position: {position}. Must be 0-8."}
        if board[position] is not None:
            return {"success": False, "error": f"Position {position} already occupied"}

        new_board = board.copy()
        new_board[position] = "O"
        winner = TicTacToeGameLogic.check_winner(new_board)
        return {
            "success": True,
            "board": new_board,
            "position": position,
            "winner": winner,
            "is_draw": winner is None and all(c is not None for c in new_board),
        }


# System prompt guiding agent strategy
TICTACTOE_SYSTEM_PROMPT = """You are an expert Tic Tac Toe player. You are O, your opponent is X.

Your strategy in priority order:
1. **WIN:** Can you complete three O's in a row? If yes, make that move immediately.
2. **BLOCK:** Will opponent (X) win on their next turn? If yes, block them by placing O where they would win.
3. **CENTER:** If center (position 4) is empty, take it.
4. **CORNERS:** Prefer corners (0, 2, 6, 8) for strategic advantage.
5. **EDGES:** Take remaining edges (1, 3, 5, 7).

Always analyze the board carefully. Use the describe_board tool to see the current state.
Use the make_move tool with exactly ONE position (0-8) when ready to move.

Be confident and strategic. Think like a pro player.""".strip()


def create_tictactoe_agent():
    """Create and configure ReAct agent for Tic Tac Toe using local tools."""
    
    # Check if LLM is properly configured
    if not settings.litellm_proxy_url or not settings.litellm_api_key:
        raise ValueError(
            "LiteLLM not configured. Set LITELLM_PROXY_URL and LITELLM_API_KEY environment variables."
        )
    
    # Define local tools using @tool decorator.
    @tool
    def validate_board(board: list) -> bool:
        """Check if the board state is a valid Tic Tac Toe game state (must have equal X and O counts)."""
        return TicTacToeGameLogic.validate_board(board)

    @tool
    def get_legal_moves(board: list) -> list[int]:
        """Get list of empty board positions where you can place your move (returns list of 0-8 indices)."""
        return TicTacToeGameLogic.get_legal_moves(board)

    @tool
    def describe_board(board: list) -> str:
        """Convert board state to human-readable ASCII format so you can analyze it properly."""
        return TicTacToeGameLogic.describe_board(board)

    @tool
    def check_winner(board: list) -> str | None:
        """Check if anyone has won the game. Returns 'X', 'O', or None (if game ongoing/draw)."""
        return TicTacToeGameLogic.check_winner(board)

    @tool
    def make_move(board: list, position: int) -> dict:
        """Place your (O) move on the board at given position (0-8). Returns new board state and game status."""
        result = TicTacToeGameLogic.make_move(board, position)
        return result

    # Initialize LLM with LiteLLM proxy using the app-wide configured model.
    llm = ChatOpenAI(
        model=settings.llm_model,
        temperature=0.3,  # Lower temp for better strategy consistency
        base_url=settings.litellm_proxy_url,
        api_key=settings.litellm_api_key,
        timeout=30,
    )

    # Create tools list
    tools = [validate_board, get_legal_moves, describe_board, check_winner, make_move]

    # Create ReAct agent with explicit system prompt.
    agent_executor = create_react_agent(llm, tools, prompt=TICTACTOE_SYSTEM_PROMPT)

    return agent_executor


def parse_agent_move(agent_result: dict) -> tuple[int, str, bool]:
    """
    Extract move position and game state from agent output.
    
    Returns:
        (position, reasoning, game_ended)
    """
    move_output = agent_result.get("output", "")
    move_position = -1
    game_ended = False

    # Try to extract position from agent's text output
    # Agent should have called make_move tool, but we parse the final output as fallback
    import re
    
    # Look for patterns like "position X" or "move X" or just the number
    patterns = [
        r"move.*?(\d)",
        r"position.*?(\d)",
        r"place.*?(\d)",
        r"\[(\d)\]",
        r"^(\d)$",
    ]
    
    for pattern in patterns:
        match = re.search(pattern, move_output, re.IGNORECASE)
        if match:
            move_position = int(match.group(1))
            if 0 <= move_position <= 8:
                break

    # Check if game state is mentioned in output
    if any(word in move_output.lower() for word in ["won", "win", "draw", "tie", "game over", "end"]):
        game_ended = True

    return move_position, move_output, game_ended
