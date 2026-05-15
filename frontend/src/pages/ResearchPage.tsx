import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthQuery, useLogoutMutation } from "../hooks/useAuth";

// ── types ──────────────────────────────────────────────────────────────────────

type ArxivPaper = {
  arxiv_id: string;
  title: string;
  authors: string[];
  published: string;
  summary: string;
  url: string;
  categories: string[];
};

type DigestPaper = {
  arxiv_id: string;
  title: string;
  authors: string[];
  published: string;
  url: string;
  relevance: string;
  contribution: string;
};

type DigestResult = {
  topic: string;
  tldr: string;
  key_themes: string[];
  papers: DigestPaper[];
  gaps: string[];
  recommended_next_steps: string[];
};

type StatusEvent = { type: "status"; text: string };
type PapersEvent = { type: "papers"; papers: ArxivPaper[] };
type TokenEvent  = { type: "token";  text: string };
type DoneEvent   = { type: "done" };
type ErrorEvent  = { type: "error"; text: string };
type StreamEvent = StatusEvent | PapersEvent | TokenEvent | DoneEvent | ErrorEvent;

// ── component ─────────────────────────────────────────────────────────────────

function ResearchPage() {
  const navigate = useNavigate();
  const authQuery = useAuthQuery();
  const logoutMutation = useLogoutMutation();

  const [topic, setTopic] = useState("");
  const [maxPapers, setMaxPapers] = useState(8);
  const [running, setRunning] = useState(false);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [rawPapers, setRawPapers] = useState<ArxivPaper[]>([]);
  const [tokenBuffer, setTokenBuffer] = useState("");
  const [digest, setDigest] = useState<DigestResult | null>(null);
  const [streamError, setStreamError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const handleLogout = async () => {
    try { await logoutMutation.mutateAsync(); } finally { navigate("/", { replace: true }); }
  };

  const reset = () => {
    setStatusLog([]);
    setRawPapers([]);
    setTokenBuffer("");
    setDigest(null);
    setStreamError("");
  };

  const handleRun = async () => {
    const q = topic.trim();
    if (!q || running) return;
    reset();
    setRunning(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const resp = await fetch(`${baseUrl}/api/research/digest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ topic: q, max_papers: maxPapers }),
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { detail?: string };
        throw new Error(err.detail ?? `HTTP ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buf = "";
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          const payload = line.startsWith("data: ") ? line.slice(6) : line;
          if (!payload.trim()) continue;
          try {
            const ev = JSON.parse(payload) as StreamEvent;
            if (ev.type === "status") {
              setStatusLog((prev) => [...prev, ev.text]);
            } else if (ev.type === "papers") {
              setRawPapers(ev.papers);
            } else if (ev.type === "token") {
              accumulated += ev.text;
              setTokenBuffer(accumulated);
            } else if (ev.type === "done") {
              // parse accumulated JSON into digest
              try {
                const parsed = JSON.parse(accumulated) as DigestResult;
                setDigest(parsed);
              } catch {
                // LLM might have wrapped in markdown fences — strip them
                const stripped = accumulated.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
                try {
                  const parsed = JSON.parse(stripped) as DigestResult;
                  setDigest(parsed);
                } catch {
                  setStreamError("Could not parse digest JSON. Raw output shown below.");
                }
              }
              setTokenBuffer("");
            } else if (ev.type === "error") {
              setStreamError(ev.text);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setStreamError((err as Error).message ?? "Unexpected error");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const name = authQuery.data?.name ?? "User";

  return (
    <main className="flex h-screen w-full flex-col bg-slate-50">
      {/* ── Header ── */}
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3557e6]">
              <span className="text-lg font-bold text-white">R</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Research Digest Agent</h1>
              <p className="text-xs text-slate-500">Autonomous arXiv search · {name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/chat")}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              ← Chat
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 overflow-auto p-6 lg:flex-row">
        {/* ── Left: Query Panel ── */}
        <div className="flex w-full flex-col gap-4 lg:w-96 lg:shrink-0">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-sm font-semibold text-slate-900">🔬 Research Query</p>

            <label className="mb-1 block text-xs font-medium text-slate-700">Topic / Question</label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={4}
              placeholder="e.g. Retrieval-Augmented Generation for code generation"
              disabled={running}
              className="mb-3 w-full resize-none rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:border-[#3557e6] focus:outline-none focus:ring-2 focus:ring-[#c2d6ff] transition disabled:opacity-60"
            />

            <label className="mb-1 block text-xs font-medium text-slate-700">Max papers (1–20)</label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxPapers}
              onChange={(e) => setMaxPapers(Number(e.target.value))}
              disabled={running}
              className="mb-4 w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#3557e6] focus:outline-none transition disabled:opacity-60"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleRun()}
                disabled={running || !topic.trim()}
                className="flex-1 rounded-lg border border-[#1f318a] bg-[#3557e6] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2a42b8] disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {running ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Running…
                  </span>
                ) : "🚀 Run Agent"}
              </button>
              {running && (
                <button
                  type="button"
                  onClick={handleStop}
                  className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors"
                >
                  Stop
                </button>
              )}
            </div>
          </div>

          {/* Status log */}
          {statusLog.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Agent Log</p>
              <ul className="space-y-1">
                {statusLog.map((s, i) => (
                  <li key={i} className="text-xs text-slate-700">{s}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Raw papers found */}
          {rawPapers.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Papers Retrieved ({rawPapers.length})
              </p>
              <ul className="space-y-2">
                {rawPapers.map((p) => (
                  <li key={p.arxiv_id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-[#3557e6] hover:underline line-clamp-2"
                    >
                      {p.title}
                    </a>
                    <p className="mt-0.5 text-[11px] text-slate-500">{p.authors.slice(0, 2).join(", ")} · {p.published}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Right: Digest Output ── */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Streaming token preview */}
          {running && tokenBuffer && !digest && (
            <div className="rounded-xl border border-[#c2d6ff] bg-[#f0f4ff] p-4 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#3557e6]">Streaming digest…</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-800 font-mono">{tokenBuffer}</pre>
            </div>
          )}

          {/* Error */}
          {streamError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-semibold">⚠️ {streamError}</p>
              {tokenBuffer && (
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs font-mono text-red-700">{tokenBuffer}</pre>
              )}
            </div>
          )}

          {/* Structured digest */}
          {digest && (
            <div className="flex flex-col gap-5">
              {/* TL;DR */}
              <div className="rounded-xl border border-[#c2d6ff] bg-[#f0f4ff] p-5 shadow-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#3557e6]">TL;DR</p>
                <p className="text-sm font-medium text-slate-900">{digest.tldr}</p>
              </div>

              {/* Key themes */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Key Themes</p>
                <div className="flex flex-wrap gap-2">
                  {digest.key_themes.map((t) => (
                    <span key={t} className="rounded-full border border-[#c2d6ff] bg-[#f0f4ff] px-3 py-1 text-xs font-medium text-[#3557e6]">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Papers */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Analysed Papers ({digest.papers.length})
                </p>
                <div className="space-y-4">
                  {digest.papers.map((p) => (
                    <div key={p.arxiv_id} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-[#3557e6] hover:underline"
                        >
                          {p.title}
                        </a>
                        <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                          {p.arxiv_id}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{p.authors.slice(0, 3).join(", ")} · {p.published}</p>
                      <div className="mt-2 grid gap-1 md:grid-cols-2">
                        <div className="rounded bg-white px-3 py-2 text-xs text-slate-700 border border-slate-200">
                          <span className="font-semibold text-slate-900">Relevance: </span>{p.relevance}
                        </div>
                        <div className="rounded bg-white px-3 py-2 text-xs text-slate-700 border border-slate-200">
                          <span className="font-semibold text-slate-900">Contribution: </span>{p.contribution}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gaps & Next Steps */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-700">Open Gaps</p>
                  <ul className="space-y-1.5">
                    {digest.gaps.map((g, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-amber-900">
                        <span className="mt-0.5 text-amber-500">◈</span>{g}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-green-200 bg-green-50 p-5 shadow-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-green-700">Recommended Next Steps</p>
                  <ul className="space-y-1.5">
                    {digest.recommended_next_steps.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-green-900">
                        <span className="mt-0.5 text-green-500">→</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!running && !digest && !streamError && statusLog.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f0f4ff] text-3xl">🔬</div>
              <div>
                <p className="text-base font-semibold text-slate-800">Research Digest Agent</p>
                <p className="mt-1 text-sm text-slate-500">Enter a topic, click <strong>Run Agent</strong>, and watch it autonomously search arXiv and stream a structured digest.</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs text-slate-600">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-lg mb-1">🔍</p>
                  <p className="font-medium">Searches arXiv</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-lg mb-1">🧠</p>
                  <p className="font-medium">Analyses Papers</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-lg mb-1">📋</p>
                  <p className="font-medium">Streams Digest</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default ResearchPage;
