"""Tic Tac Toe ReAct Agent with MCP Integration.

Project 12 — MCP Integration Swap
──────────────────────────────────

This agent now uses tools provided by the MCP server module instead of
hand-written functions. The agent logic, system prompt, and frontend remain
completely unchanged — only the tool execution source has changed.

Key Architectural Change:
  Before (Project 11): Agent → Hand-written Python functions in this file
  After (Project 12):  Agent → MCP Server Module (separate, decoupled, swappable)

This demonstrates the MCP principle: tools can be provided by any compatible
source (local module, remote server, plugin system) without changing the agent
implementation.
"""
from __future__ import annotations

from langchain_core.tools import tool, ToolException
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from app.core.config import settings
# ─── MCP Integration ───────────────────────────────────────────────────────
# Import game logic from MCP server module
# In production, this could be replaced with a remote MCP server via ClientSession
from mcp_servers.tictactoe_mcp import TicTacToeGameLogic


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
    """Create and configure ReAct agent for Tic Tac Toe powered by MCP server.
    
    The agent's system prompt and logic are IDENTICAL to Project 11.
    The only difference: tools now come from the MCP server module instead of
    being defined directly in this file. This demonstrates the MCP principle
    that tools can be swapped without changing the agent.
    """
    
    # Define tools using @tool decorator, delegating to MCP server module
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
        if not result.get("success"):
            raise ToolException(result.get("error", "Move failed"))
        return result

    # Initialize LLM with LiteLLM proxy
    llm = ChatOpenAI(
        model_name="gemini-2.5-flash",
        temperature=0.3,  # Lower temp for better strategy consistency
        base_url=settings.litellm_proxy_url,
        api_key=settings.litellm_api_key,
        timeout=30,
    )

    # Create tools list
    tools = [validate_board, get_legal_moves, describe_board, check_winner, make_move]

    # Create ReAct agent (system prompt handled through tool descriptions + llm system role)
    agent_executor = create_react_agent(llm, tools)

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
