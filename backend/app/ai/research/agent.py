"""
Research Digest Agent — Project 10 (Core Logic)
Autonomously searches arXiv, decides when it has enough evidence,
and streams a structured digest token-by-token via an async generator.

PROJECT 12 UPGRADE: Tool functions now imported from MCP server.
Agent logic, system prompt, and streaming contract remain UNCHANGED.
"""
from __future__ import annotations

import json
from typing import AsyncGenerator

from mcp_servers.research_mcp import ResearchToolkit

from app.ai.llm import llm


# ── system prompt ──────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a senior AI research analyst. Your job is to produce a structured Research Digest.

WORKFLOW
1. You will be given a research topic and a set of arXiv papers already retrieved for you.
2. Analyse the papers and produce a digest with EXACTLY the following JSON structure — no markdown fences, just raw JSON:

{
  "topic": "<the research topic>",
  "tldr": "<2–3 sentence executive summary>",
  "key_themes": ["<theme 1>", "<theme 2>", ...],
  "papers": [
    {
      "arxiv_id": "<id>",
      "title": "<title>",
      "authors": ["<name>", ...],
      "published": "<YYYY-MM-DD>",
      "url": "<url>",
      "relevance": "<1–2 sentence reason this paper is relevant>",
      "contribution": "<1–2 sentence main contribution>"
    }
  ],
  "gaps": ["<open problem 1>", "<open problem 2>", ...],
  "recommended_next_steps": ["<step 1>", "<step 2>", ...]
}

Rules:
- Only include papers from the provided list.
- key_themes: 3–6 items.
- gaps: 2–4 open problems in the field.
- recommended_next_steps: 2–4 actionable suggestions for a researcher.
- Return ONLY valid JSON. No preamble, no trailing text.
"""


# ── main streaming entry point ─────────────────────────────────────────────────

async def stream_research_digest(
    topic: str,
    max_papers: int = 8,
) -> AsyncGenerator[str, None]:
    """
    Async generator that yields SSE-compatible event strings:
      data: {"type": "status",  "text": "..."}
      data: {"type": "papers",  "papers": [...]}
      data: {"type": "token",   "text": "..."}
      data: {"type": "done"}
      data: {"type": "error",   "text": "..."}
    """
    def _emit(payload: dict) -> str:
        return f"data: {json.dumps(payload)}\n\n"

    try:
        # ── Step 1: status ─────────────────────────────────────────────────────
        yield _emit({"type": "status", "text": f"🔍 Searching arXiv for: {topic}"})

        # ── Step 2: fetch papers via MCP toolkit ────────────────────────────────
        yield _emit({"type": "status", "text": f"🔧 [MCP] Calling ResearchToolkit.search_arxiv(query={topic!r}, max_results={max_papers})"})
        import anyio
        result = await anyio.to_thread.run_sync(
            lambda: ResearchToolkit.search_arxiv(topic, max_results=max_papers)
        )
        papers = result.get("papers", []) if result.get("success") else []
        yield _emit({"type": "status", "text": f"🔧 [MCP] search_arxiv returned {len(papers)} papers (success={result.get('success')})"})


        if not papers:
            yield _emit({"type": "error", "text": "No papers found on arXiv for this topic. Try a different query."})
            return

        yield _emit({"type": "status", "text": f"✅ Found {len(papers)} papers. Generating digest…"})
        yield _emit({"type": "papers", "papers": papers})

        # ── Step 3: build LLM prompt ───────────────────────────────────────────
        papers_text = json.dumps(papers, indent=2)
        user_message = (
            f"Research topic: {topic}\n\n"
            f"arXiv papers retrieved ({len(papers)} total):\n{papers_text}\n\n"
            "Produce the structured Research Digest JSON now."
        )

        # ── Step 4: stream LLM tokens ─────────────────────────────────────────
        yield _emit({"type": "status", "text": "🧠 Analysing and structuring digest…"})

        streaming_llm = llm.with_config({"tags": ["research_digest"]})
        async for chunk in streaming_llm.astream(
            [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ]
        ):
            text = chunk.content if hasattr(chunk, "content") else str(chunk)
            if text:
                yield _emit({"type": "token", "text": text})

        yield _emit({"type": "done"})

    except Exception as exc:  # noqa: BLE001
        yield _emit({"type": "error", "text": f"Research agent error: {exc}"})
