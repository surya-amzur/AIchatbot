"""
Research MCP Server — Project 12
Encapsulates research tools (arXiv search) via Model Context Protocol.
Can be swapped into the research agent without changing agent logic,
system prompt, or frontend behavior.
"""
from __future__ import annotations

import json
import textwrap
import time
from typing import Any

import arxiv

# ─────────────────────────────────────────────────────────────────────────────
# Research Tool Functions (extracted from agent.py)
# ─────────────────────────────────────────────────────────────────────────────


class ResearchToolkit:
    """Encapsulates all research-related tools for MCP exposure."""

    @staticmethod
    def search_arxiv(query: str, max_results: int = 8) -> dict[str, Any]:
        """
        Search arXiv for papers matching the query.

        Args:
            query: Search query string (e.g., "machine learning")
            max_results: Maximum number of papers to return (1-50)

        Returns:
            Dictionary with "success" bool and "papers" list or "error" string
        """
        try:
            client = arxiv.Client(
                page_size=max_results, delay_seconds=3, num_retries=5
            )
            search = arxiv.Search(
                query=query,
                max_results=max_results,
                sort_by=arxiv.SortCriterion.Relevance,
            )

            for attempt in range(3):
                try:
                    results = []
                    for paper in client.results(search):
                        results.append(
                            {
                                "arxiv_id": paper.entry_id.split("/abs/")[-1],
                                "title": paper.title.strip(),
                                "authors": [a.name for a in paper.authors[:4]],
                                "published": (
                                    paper.published.strftime("%Y-%m-%d")
                                    if paper.published
                                    else ""
                                ),
                                "summary": textwrap.shorten(
                                    paper.summary.strip().replace("\n", " "),
                                    width=400,
                                    placeholder="...",
                                ),
                                "url": paper.entry_id,
                                "categories": paper.categories[:3],
                            }
                        )
                    return {"success": True, "papers": results}

                except Exception as exc:
                    if "429" in str(exc) and attempt < 2:
                        time.sleep(5 * (attempt + 1))
                        continue
                    raise

            return {"success": False, "error": "Max retries exceeded"}

        except Exception as e:
            return {"success": False, "error": str(e)}

    @staticmethod
    def validate_query(query: str) -> dict[str, Any]:
        """
        Validate a research query before searching.

        Args:
            query: Query string to validate

        Returns:
            Dictionary with "valid" bool and optional "error" string
        """
        if not query or not query.strip():
            return {"valid": False, "error": "Query cannot be empty"}

        if len(query) < 3:
            return {"valid": False, "error": "Query too short (min 3 characters)"}

        if len(query) > 300:
            return {"valid": False, "error": "Query too long (max 300 characters)"}

        return {"valid": True}

    @staticmethod
    def filter_papers_by_date(
        papers: list[dict], start_year: int, end_year: int
    ) -> dict[str, Any]:
        """
        Filter papers by publication year range.

        Args:
            papers: List of paper dictionaries
            start_year: Minimum publication year (inclusive)
            end_year: Maximum publication year (inclusive)

        Returns:
            Dictionary with filtered "papers" list
        """
        try:
            filtered = []
            for paper in papers:
                pub_date = paper.get("published", "")
                if pub_date:
                    year = int(pub_date[:4])
                    if start_year <= year <= end_year:
                        filtered.append(paper)
            return {"success": True, "papers": filtered, "count": len(filtered)}
        except Exception as e:
            return {"success": False, "error": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# MCP Server Registration
# ─────────────────────────────────────────────────────────────────────────────


def create_research_server():
    """
    Factory function to create and configure the Research MCP server.

    In a real MCP environment, this would register tools with the protocol.
    For now, this returns the toolkit for direct import.
    """
    return ResearchToolkit
