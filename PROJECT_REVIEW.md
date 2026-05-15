# Project Review: Tic Tac Toe Agent & MCP Integration

## Executive Summary

**Current State (Project 10):** Standard minimax algorithm for unbeatable Tic Tac Toe  
**Goal (Project 11):** AI Agent with LiteLLM integration for intelligent gameplay  
**Next Phase (Project 12):** MCP server integration replacing hand-written tools  

---

## Project 10 — Current Tic Tac Toe Implementation ✅

### Architecture

**Backend (Perfect Information):**
- Minimax algorithm with perfect game-theoretic knowledge
- State: Board represented as `list[9]` with "X", "O", or None
- Endpoint: `POST /api/tictactoe/move` 
- Logic: Evaluate all possible future states recursively

**Frontend (React State):**
- User clicks board → adds "X"
- Calls backend with board state
- Backend returns board state + move + winner status
- Displays agent move "O" + game outcome

### Key Files
- Backend: [backend/app/api/tictactoe.py](backend/app/api/tictactoe.py)
- Frontend: [frontend/src/pages/TicTacToePage.tsx](frontend/src/pages/TicTacToePage.tsx)

### Hand-Written Functions (Project 10 → Project 12 MCP Candidates)
```python
_validate_board_state(board)     # Enforce legal game states
_winner(board)                   # Check win condition  
_minimax(board, is_maximizing)   # Recursive minimax evaluation
_best_move(board)                # Find optimal move using minimax
```

---

## Project 11 — AI Agent Enhancement ⬜ PLANNED

### Objective
Replace deterministic minimax with an **intelligent LLM-based agent** that:
- Uses LiteLLM for reasoning about the game
- Makes moves via tool-calling (not pre-calculated)
- Can play competitively but with "personality" from the LLM
- Demonstrates ReAct pattern (Reasoning + Acting)

### Design

#### 1. **Agent Architecture**
Use LangChain **ReAct Agent** with tool-calling:
```
User's Move → Prompt with board state → LLM reasons about strategy → 
Tool: make_move(position) → Return new board state → 
Display result & continue
```

#### 2. **System Prompt** (for LiteLLM/gemini-2.5-flash)
```
You are playing Tic Tac Toe against a human opponent. 
You are X, the human is O.
You can see the current board state and must decide your next move.
Think through your strategy:
1. Can you win on this turn? (prioritize)
2. Can you block an opponent win? (secondary)
3. Take the best available position.

Always use the make_move tool with a valid position (0-8).
```

#### 3. **Tool Definitions** (Initial Hand-Written)
```python
class TicTacToeTools:
    def validate_board(board: list) -> bool
    def get_winner(board: list) -> Optional[str]
    def get_legal_moves(board: list) -> list[int]
    def make_move(board: list, position: int, player: str) -> list
    def get_board_description(board: list) -> str  # For LLM understanding
```

#### 4. **Backend Flow**
```python
@router.post("/move-agent")
async def agent_move_v2(req: MoveRequest, user: User):
    from langchain.agents import AgentExecutor, create_react_agent
    from langchain_openai import ChatOpenAI
    
    agent = create_react_agent(
        llm=ChatOpenAI(
            model="gemini-2.5-flash",
            base_url=settings.litellm_proxy_url,
            api_key=settings.litellm_api_key,
        ),
        tools=[
            Tool(name="validate_board", func=validate_board, ...),
            Tool(name="get_legal_moves", func=get_legal_moves, ...),
            Tool(name="make_move", func=make_move, ...),
        ],
        system_prompt=TICTACTOE_SYSTEM_PROMPT,
    )
    
    executor = AgentExecutor.from_agent_and_tools(agent, tools)
    
    board_desc = get_board_description(req.board)
    result = executor.invoke({
        "input": f"Current board:\n{board_desc}\n\nMake your move."
    })
    
    return {
        "board": result["board"],
        "move": result["move_position"],
        "reasoning": result["agent_reasoning"],
        "winner": check_winner(result["board"]),
    }
```

#### 5. **Frontend Changes (Minimal)**
- Update endpoint from `/api/tictactoe/move` → `/api/tictactoe/move-agent`
- Display agent reasoning in UI (optional)
- Keep UI logic the same

### Key Benefits
✅ Demonstrates ReAct agent pattern  
✅ Shows LLM + tool-calling integration  
✅ Personality & reasoning visible to user  
✅ Serves as foundation for Project 12 (MCP swap)  
✅ Fully routed through LiteLLM proxy  

### Implementation Checklist
- [ ] Define `TicTacToeTools` class with tool functions
- [ ] Create LangChain ReAct agent with tools
- [ ] Add new endpoint `/api/tictactoe/move-agent`
- [ ] Update system prompt for game strategy
- [ ] Update frontend to call new endpoint
- [ ] Test agent vs. human gameplay
- [ ] Add reasoning display in UI (optional)
- [ ] Smoke test: Verify agent wins/draws appropriately

---

## Project 12 — MCP Integration ⬜ PLANNED

### Objective
**Swap tool execution mechanism** from hand-written functions to **MCP server** without changing:
- Agent logic
- System prompt  
- Frontend code
- Overall gameplay experience

### Architecture Evolution

**Before (Project 11 - Hand-Written Tools):**
```
Frontend → Backend Agent → 
  [Hand-written Python tools] → 
    validate_board(), make_move(), etc. → 
      Return result → Frontend
```

**After (Project 12 - MCP Server):**
```
Frontend → Backend Agent → 
  [MCP Client] → 
    MCP Server Process (separate) → 
      [Tool implementations in MCP] → 
        Return results → Agent → Frontend
```

### MCP Server Design

#### 1. **Create MCP Server Package**
```
backend/
  mcp_servers/
    tictactoe_mcp.py          # MCP server implementation
    
```

#### 2. **MCP Resource: Game State**
```json
{
  "uri": "tictactoe://board/current",
  "mimeType": "application/json",
  "contents": {
    "cells": [null, "X", "O", ...],
    "legal_moves": [0, 2, 5, 7],
    "turn": "agent"
  }
}
```

#### 3. **MCP Tools (Server Exposes These)**
```
Tool: tictactoe/validate_board
Tool: tictactoe/get_legal_moves  
Tool: tictactoe/make_move
Tool: tictactoe/check_winner
Tool: tictactoe/describe_board
```

#### 4. **Backend Setup**
```python
# Project 11: Direct tool calls
agent = create_react_agent(
    llm=llm,
    tools=[
        Tool(name="validate_board", func=validate_board_py),
        Tool(name="make_move", func=make_move_py),
    ]
)

# Project 12: MCP-based tools
from mcp.client import ClientSession
from mcp.client.stdio import StdioClientTransport

mcp_client = ClientSession(
    transport=StdioClientTransport(
        command="python",
        args=["-m", "backend.mcp_servers.tictactoe_mcp"]
    )
)

tools = mcp_client.list_tools()  # Auto-discover from MCP server
agent = create_react_agent(llm=llm, tools=tools)
```

#### 5. **Key Benefits of MCP Approach**
✅ **Pluggable:** Swap MCP server without changing agent  
✅ **Decoupled:** Tool logic lives separately (easier testing, versioning)  
✅ **Discoverable:** Agent auto-discovers tools from MCP  
✅ **Scalable:** MCP server can be remote, multi-processed, or containerized  
✅ **Composable:** Can combine multiple MCP servers (tictactoe + web-search + calc)  
✅ **Standard:** Demonstrates Model Context Protocol pattern  

### Implementation Checklist
- [ ] Create `backend/mcp_servers/` package
- [ ] Implement MCP server with Tic Tac Toe tools
- [ ] Install `mcp` Python package
- [ ] Update agent setup to use MCP client
- [ ] Test agent with MCP backend (should behave identically to Project 11)
- [ ] Verify tool discovery works
- [ ] Update system prompt if needed
- [ ] Smoke test: Gameplay identical to Project 11

### Testing Strategy
1. **Unit Test:** MCP server tools in isolation
2. **Integration Test:** Agent communicates with MCP server correctly
3. **Regression Test:** Gameplay behavior identical to Project 11
4. **E2E Test:** Frontend → Agent → MCP → Result

---

## Technical Stack

### Project 11 (AI Agent)
- **Agent Framework:** LangChain `create_react_agent` + `AgentExecutor`
- **LLM:** `gemini-2.5-flash` via LiteLLM proxy  
- **Tool Framework:** LangChain `Tool` + `@tool` decorator
- **Pattern:** ReAct (Reasoning + Acting)

### Project 12 (MCP)
- **Protocol:** Model Context Protocol (MCP)
- **Python Package:** `mcp` (pip install)
- **Transport:** Stdio (subprocess communication)
- **Tool Registration:** Auto-discovery from MCP server

### Dependencies to Add
```
# Project 11
langchain >= 0.1.0
langchain-openai >= 0.0.1

# Project 12  
mcp >= 0.1.0  # When available
```

---

## Comparison: Projects 10 vs 11 vs 12

| Aspect | Project 10 (Standard) | Project 11 (AI Agent) | Project 12 (MCP) |
|--------|-------|----------|------|
| **Algorithm** | Minimax (perfect) | LLM Reasoning (stochastic) | Same as P11 |
| **Tool Location** | Hardcoded in backend | Hand-written in backend | MCP Server |
| **Tool Discovery** | Manual registration | Manual registration | Auto-discovery |
| **LLM Used** | None | Yes (LiteLLM) | Yes (same) |
| **System Prompt** | N/A | Yes (strategy) | Same prompt |
| **Frontend Changes** | None | Minimal (endpoint) | None |
| **Gameplay** | Always wins/draws | Intelligent + variable | Same as P11 |
| **Extensibility** | Hard (add minimax logic) | Medium (add tools) | Easy (add MCP tools) |

---

## Phased Rollout Plan

### Phase 1: Project 11 (4-6 hours)
1. Create `TicTacToeTools` class with extracted minimax functions
2. Build LangChain ReAct agent wrapper
3. Add new `/api/tictactoe/move-agent` endpoint  
4. Update frontend to call new endpoint
5. Test & validate gameplay
6. **Result:** AI agent playing with LLM reasoning

### Phase 2: Project 12 (2-4 hours)
1. Create `backend/mcp_servers/tictactoe_mcp.py`
2. Implement MCP server with Tool definitions
3. Update agent to use MCP client instead of direct tools
4. Run regression tests
5. **Result:** Same behavior, decoupled tool architecture

### Phase 3: Future Extensions (Optional)
- Add web search tool to MCP server (agent researches opponents)
- Add calculator tool (agent reasons about combinations)
- Chain multiple MCP servers (tic-tac-toe + general assistant)
- Deploy MCP server as microservice

---

## Code Example: Project 11 Agent Implementation

```python
# backend/app/ai/agents/tictactoe_agent.py

from langchain.agents import AgentExecutor, create_react_agent, Tool
from langchain.chat_models import ChatOpenAI
from app.core.config import settings

# ── Tool Functions ──
def validate_board_tool(board: list[str | None]) -> bool:
    """Validate board state for legal Tic Tac Toe game."""
    return len(board) == 9 and all(c in {None, "X", "O"} for c in board)

def get_legal_moves_tool(board: list[str | None]) -> list[int]:
    """Return list of valid move positions (0-8)."""
    return [i for i, c in enumerate(board) if c is None]

def make_move_tool(board: list[str | None], position: int) -> list[str | None]:
    """Place agent's move (O) on board."""
    if position < 0 or position >= 9 or board[position] is not None:
        raise ValueError(f"Invalid move: {position}")
    new_board = board.copy()
    new_board[position] = "O"
    return new_board

def check_winner_tool(board: list[str | None]) -> str | None:
    """Check if X, O, or None (draw/ongoing)."""
    lines = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ]
    for a, b, c in lines:
        if board[a] and board[a] == board[b] == board[c]:
            return board[a]
    return None

def describe_board_tool(board: list[str | None]) -> str:
    """Convert board list to readable description for LLM."""
    grid = []
    for i in range(3):
        row = []
        for j in range(3):
            cell = board[i*3 + j]
            row.append(cell or str(i*3 + j))
        grid.append(" | ".join(row))
    return "\n---------\n".join(grid)

# ── Agent Setup ──
TICTACTOE_SYSTEM_PROMPT = """
You are an expert Tic Tac Toe player. You are O, your opponent is X.

Analyze the board carefully:
1. Check if you can WIN this turn (three O's in a row)
2. Check if opponent (X) will WIN next turn → BLOCK them
3. Take center (4) if available
4. Take corners (0,2,6,8) if available  
5. Take edges (1,3,5,7)

Always make exactly ONE move using make_move tool with a valid position (0-8).
""".strip()

def create_tictactoe_agent():
    """Create ReAct agent for Tic Tac Toe."""
    llm = ChatOpenAI(
        model_name="gemini-2.5-flash",
        temperature=0.3,  # Lower temp for better strategy
        base_url=settings.litellm_proxy_url,
        api_key=settings.litellm_api_key,
    )
    
    tools = [
        Tool(
            name="validate_board",
            func=validate_board_tool,
            description="Check if board state is valid"
        ),
        Tool(
            name="get_legal_moves",
            func=get_legal_moves_tool,
            description="Get list of empty positions (0-8)"
        ),
        Tool(
            name="make_move",
            func=make_move_tool,
            description="Place O at position (returns new board)"
        ),
        Tool(
            name="check_winner",
            func=check_winner_tool,
            description="Check if anyone won (returns 'X', 'O', or None)"
        ),
        Tool(
            name="describe_board",
            func=describe_board_tool,
            description="Get human-readable board representation"
        ),
    ]
    
    agent = create_react_agent(
        llm,
        tools,
        system_prompt=TICTACTOE_SYSTEM_PROMPT,
    )
    
    return AgentExecutor.from_agent_and_tools(
        agent,
        tools,
        verbose=True,
        max_iterations=5,  # Prevent infinite loops
    )

# ── FastAPI Endpoint ──
from fastapi import APIRouter, Depends

router = APIRouter(prefix="/api/tictactoe", tags=["tictactoe"])
_agent_executor = None

def get_agent():
    global _agent_executor
    if _agent_executor is None:
        _agent_executor = create_tictactoe_agent()
    return _agent_executor

@router.post("/move-agent")
async def agent_move_v2(req: MoveRequest, user: User = Depends(get_current_user)):
    agent = get_agent()
    board_desc = describe_board_tool(req.board)
    
    result = agent.invoke({
        "input": f"Current board:\n{board_desc}\n\nMake your next move."
    })
    
    # Parse agent's move from tool call
    move_pos = extract_move_position(result)
    new_board = make_move_tool(req.board, move_pos)
    winner = check_winner_tool(new_board)
    
    return MoveResponse(
        board=new_board,
        move=move_pos,
        reasoning=result.get("output", ""),
        winner=winner,
        draw=winner is None and all(c is not None for c in new_board),
    )
```

---

## Success Criteria

### Project 11 ✓
- [ ] Agent makes valid moves every turn
- [ ] Intelligent strategy (blocks opponent, seeks win)
- [ ] Gameplay against human is competitive
- [ ] LLM is called through LiteLLM proxy
- [ ] Reasoning is visible in response
- [ ] No breaking changes to frontend

### Project 12 ✓
- [ ] MCP server successfully starts
- [ ] Agent discovers & uses MCP tools
- [ ] Gameplay identical to Project 11
- [ ] Tool logic fully moved to MCP server
- [ ] Can start/stop MCP server independently
- [ ] Agent works even if MCP server is remote

---

## Next Steps

1. **Review & Approve** this plan
2. **Implement Project 11** (AI Agent with LiteLLM)
3. **Validate** gameplay & LLM routing  
4. **Implement Project 12** (MCP Integration)
5. **Test** tool swapping doesn't affect behavior
6. **Document** MCP server for future extensions

---

**Owner:** Architecture & AI Team  
**Timeline:** 1-2 weeks (1 week per phase)  
**Priority:** Medium (Foundation for Agent Modules)
