"""Tic Tac Toe MCP Server - Exposes game tools via Model Context Protocol.

This server encapsulates all Tic Tac Toe game logic and makes it available
to LangChain agents via the MCP protocol. The agent remains completely unchanged
- it just pulls tools from this MCP server instead of using hand-written functions.
"""

import asyncio
import json
from typing import Any

from mcp.server import Server
from mcp.types import Tool, TextContent


# ─────────────────────────────────────────────────────────────────────────────
# Tool Implementations (Pure Functions)
# ─────────────────────────────────────────────────────────────────────────────

class TicTacToeGameLogic:
    """Pure Tic Tac Toe game logic functions."""

    @staticmethod
    def validate_board(board: list) -> bool:
        """Check if the board state is valid Tic Tac Toe state."""
        if not isinstance(board, list) or len(board) != 9:
            return False
        for cell in board:
            if cell not in {None, "X", "O"}:
                return False
        # Check turn count: X should equal O (agent's turn)
        x_count = board.count("X")
        o_count = board.count("O")
        return x_count == o_count

    @staticmethod
    def get_legal_moves(board: list) -> list[int]:
        """Return list of valid move positions (0-8)."""
        if not isinstance(board, list) or len(board) != 9:
            return []
        return [i for i, cell in enumerate(board) if cell is None]

    @staticmethod
    def describe_board(board: list) -> str:
        """Convert board list to readable ASCII representation."""
        if not isinstance(board, list) or len(board) != 9:
            return "Invalid board"

        grid = []
        for i in range(3):
            row = []
            for j in range(3):
                idx = i * 3 + j
                cell = board[idx]
                if cell:
                    row.append(cell)
                else:
                    row.append(str(idx))
            grid.append(" | ".join(row))
        
        ascii_board = "\n---------\n".join(grid)
        return f"Board positions (0-8):\n{ascii_board}"

    @staticmethod
    def check_winner(board: list) -> str | None:
        """Check if X, O won, or None (ongoing/draw)."""
        if not isinstance(board, list) or len(board) != 9:
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
        """Place agent move (O) at position. Returns new board state."""
        if not isinstance(board, list) or len(board) != 9:
            return {"success": False, "error": "Invalid board state"}
        
        if not isinstance(position, int) or position < 0 or position > 8:
            return {"success": False, "error": f"Invalid position: {position}. Must be 0-8."}
        
        if board[position] is not None:
            return {"success": False, "error": f"Position {position} already occupied"}
        
        new_board = board.copy()
        new_board[position] = "O"
        return {
            "success": True,
            "board": new_board,
            "position": position,
            "winner": TicTacToeGameLogic.check_winner(new_board),
            "is_draw": TicTacToeGameLogic.check_winner(new_board) is None and all(c is not None for c in new_board),
        }


# ─────────────────────────────────────────────────────────────────────────────
# MCP Server Implementation
# ─────────────────────────────────────────────────────────────────────────────

def create_tictactoe_server() -> Server:
    """Create and configure MCP server for Tic Tac Toe."""
    server = Server("tictactoe-mcp")

    # ─────────────────────────────────────────────────────────────────────────
    # Tool Handlers
    # ─────────────────────────────────────────────────────────────────────────

    @server.call_tool()
    async def validate_board_handler(board: list) -> str:
        """Validate board state - check if it's a legal Tic Tac Toe position."""
        result = TicTacToeGameLogic.validate_board(board)
        return json.dumps({"valid": result})

    @server.call_tool()
    async def get_legal_moves_handler(board: list) -> str:
        """Get list of empty positions where a move can be made (0-8)."""
        moves = TicTacToeGameLogic.get_legal_moves(board)
        return json.dumps({"moves": moves})

    @server.call_tool()
    async def describe_board_handler(board: list) -> str:
        """Convert board state to human-readable ASCII format."""
        description = TicTacToeGameLogic.describe_board(board)
        return description

    @server.call_tool()
    async def check_winner_handler(board: list) -> str:
        """Check game status: returns 'X', 'O', or None (if game ongoing)."""
        winner = TicTacToeGameLogic.check_winner(board)
        return json.dumps({"winner": winner})

    @server.call_tool()
    async def make_move_handler(board: list, position: int) -> str:
        """Place agent move (O) at the given position (0-8)."""
        result = TicTacToeGameLogic.make_move(board, position)
        return json.dumps(result)

    # ─────────────────────────────────────────────────────────────────────────
    # Register Tool Schemas
    # ─────────────────────────────────────────────────────────────────────────

    # Use the handler function name as the tool name
    @server.list_tools()
    async def list_tools() -> list[Tool]:
        """List all available Tic Tac Toe tools."""
        return [
            Tool(
                name="validate_board",
                description="Check if the board state is a valid Tic Tac Toe game state (must have equal X and O counts).",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "array",
                            "items": {"type": ["string", "null"]},
                            "minItems": 9,
                            "maxItems": 9,
                            "description": "Board state as list of 9 cells: 'X', 'O', or null",
                        }
                    },
                    "required": ["board"],
                },
            ),
            Tool(
                name="get_legal_moves",
                description="Get list of empty board positions where you can place your move (returns list of 0-8 indices).",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "array",
                            "items": {"type": ["string", "null"]},
                            "minItems": 9,
                            "maxItems": 9,
                            "description": "Board state as list of 9 cells",
                        }
                    },
                    "required": ["board"],
                },
            ),
            Tool(
                name="describe_board",
                description="Convert board state to human-readable ASCII format so you can analyze it properly.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "array",
                            "items": {"type": ["string", "null"]},
                            "minItems": 9,
                            "maxItems": 9,
                            "description": "Board state as list of 9 cells",
                        }
                    },
                    "required": ["board"],
                },
            ),
            Tool(
                name="check_winner",
                description="Check if anyone has won the game. Returns 'X', 'O', or null (if game ongoing/draw).",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "array",
                            "items": {"type": ["string", "null"]},
                            "minItems": 9,
                            "maxItems": 9,
                            "description": "Board state as list of 9 cells",
                        }
                    },
                    "required": ["board"],
                },
            ),
            Tool(
                name="make_move",
                description="Place your (O) move on the board at given position (0-8). Returns new board state and game status.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "array",
                            "items": {"type": ["string", "null"]},
                            "minItems": 9,
                            "maxItems": 9,
                            "description": "Board state as list of 9 cells",
                        },
                        "position": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 8,
                            "description": "Position on board (0-8)",
                        }
                    },
                    "required": ["board", "position"],
                },
            ),
        ]

    return server


# ─────────────────────────────────────────────────────────────────────────────
# Main Entry Point
# ─────────────────────────────────────────────────────────────────────────────

async def main():
    """Run MCP server."""
    from mcp.server.stdio import stdio_server

    server = create_tictactoe_server()
    
    async with stdio_server(server) as streams:
        await server.wait_for_shutdown()


if __name__ == "__main__":
    # Use uvloop for better async performance if available
    try:
        import uvloop
        asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
    except ImportError:
        pass
    
    asyncio.run(main())

