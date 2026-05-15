# TicTacToe AI Agent - LLM Configuration Guide

## Overview

The TicTacToe AI Agent uses an **LLM (Language Model)** powered by **LiteLLM proxy** to provide intelligent game strategy. Without proper LLM configuration, the game gracefully falls back to **minimax algorithm** (still very strategic).

---

## Current Status

**LLM Mode**: ⚠️ Unavailable (API key not configured)  
**Fallback**: ✅ Minimax algorithm (uses strategic game theory)

---

## Error Explanation

When you see this message in TicTacToe:
```
🔧 Agent unavailable (LLM API key doesn't have permission for this model). Using strategic minimax algorithm.
```

This means:
- The LLM is **not configured** OR
- The API key is **invalid/expired** OR
- The API key **doesn't have permission** for the Gemini model

---

## How to Fix (Optional)

### Step 1: Obtain LLM API Keys

Choose one of these options:

**Option A: Google Vertex AI (Recommended)**
```
1. Go to Google Cloud Console: https://console.cloud.google.com/
2. Create a project or select existing one
3. Enable Vertex AI API
4. Create a service account
5. Download service account JSON key
6. Set: GOOGLE_APPLICATION_CREDENTIALS = /path/to/key.json
```

**Option B: OpenAI API**
```
1. Go to https://platform.openai.com/api-keys
2. Create API key
3. Set: OPENAI_API_KEY = sk-...
```

**Option C: LiteLLM Proxy (Self-hosted)**
```
1. Install: pip install litellm
2. Run proxy: litellm --model gpt-3.5-turbo --port 8001
3. Set LITELLM_PROXY_URL = http://localhost:8001
4. Set LITELLM_API_KEY = any-value
```

### Step 2: Update .env File

Add to `backend/.env`:

**For Google Vertex AI:**
```env
LITELLM_PROXY_URL=https://openrouter.io/api/v1
LITELLM_API_KEY=your_openrouter_key_here
```

**For OpenAI:**
```env
LITELLM_PROXY_URL=https://api.openai.com/v1
LITELLM_API_KEY=sk-your-openai-key-here
```

**For Local LiteLLM:**
```env
LITELLM_PROXY_URL=http://localhost:8001
LITELLM_API_KEY=local-proxy
```

### Step 3: Restart Backend

```bash
cd backend
python -m uvicorn app.main:app --reload
```

### Step 4: Test

1. Go to http://localhost:5173/tictactoe
2. Click "🤖 AI Agent" mode
3. Make a move (X)
4. Agent should now show reasoning instead of fallback message

---

## What's Happening Behind the Scenes

### Without LLM (Current)
```
User Move (X) → Minimax Algorithm → Best Move (O)
```

**Result**: Strong play, but no "reasoning" shown

### With LLM (When Configured)
```
User Move (X) 
  → Board State Description
    → LLM (Reasoning) → Strategic Analysis
      → Make Move
        → Explain Strategy
          → Response to User
```

**Result**: Same move quality + visible agent reasoning

---

## Game Modes

| Mode | Uses | Speed | Visibility |
|------|------|-------|------------|
| 🧮 Standard | Minimax algorithm | Instant | No reasoning shown |
| 🤖 AI Agent | LLM (when available) or Minimax fallback | Varies | Shows reasoning |

---

## Why Both Exist?

1. **Minimax**: Always available, strategic, fast, deterministic
2. **LLM Agent**: More "human-like" reasoning, can explain strategy, requires external service

Both produce **equally strong moves** - the difference is in visibility and explanation quality.

---

## Testing Without LLM (No Action Needed)

The game is **fully playable** without LLM configuration. It will:
- ✅ Play strong moves (via minimax)
- ✅ Track game state correctly  
- ✅ Show winner/draw detection
- ⏸️ Not show "thinking" process (uses fallback gracefully)

---

## Troubleshooting

### Problem: Still seeing "Agent unavailable" after configuration?

1. **Check if .env file is being loaded:**
   ```bash
   cd backend
   python -c "from app.core.config import settings; print(f'Proxy: {settings.litellm_proxy_url}'); print(f'Key: {settings.litellm_api_key}')"
   ```

2. **Restart backend after updating .env:**
   ```bash
   # Kill existing process
   # Restart: python -m uvicorn app.main:app --reload
   ```

3. **Check if API key is valid:**
   ```bash
   curl -H "Authorization: Bearer YOUR_KEY" https://api.openai.com/v1/models
   ```

4. **Verify LiteLLM proxy is running (if using local):**
   ```bash
   curl http://localhost:8001/models
   ```

---

## Code Architecture (Project 12)

The TicTacToe agent now uses **MCP (Model Context Protocol)**:

```python
# MCP Integration (File: backend/app/ai/agents/tictactoe_agent.py)

@tool
def validate_board(board: list) -> bool:
    return TicTacToeGameLogic.validate_board(board)  # ← MCP

@tool
def describe_board(board: list) -> str:
    return TicTacToeGameLogic.describe_board(board)  # ← MCP

@tool
def make_move(board: list, position: int) -> dict:
    return TicTacToeGameLogic.make_move(board, position)  # ← MCP
```

**Key Point**: Tools are decoupled from the agent - can be swapped without code changes.

---

## Summary

- ✅ **TicTacToe game works perfectly without LLM**
- ⏸️ **LLM is optional** for showing reasoning
- 🔄 **Graceful fallback** to minimax when LLM unavailable
- 📚 **MCP architecture** allows future swaps of AI provider

**No action required** unless you want to see the agent reasoning process.
