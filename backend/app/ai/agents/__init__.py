"""AI Agents module for ReAct agent patterns."""

def __getattr__(name):
    """Lazy-load agents on demand."""
    if name == "create_tictactoe_agent":
        from app.ai.agents.tictactoe_agent import create_tictactoe_agent
        return create_tictactoe_agent
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

__all__ = ["create_tictactoe_agent"]
