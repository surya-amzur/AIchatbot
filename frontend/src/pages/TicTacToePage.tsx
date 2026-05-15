import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Button from "../components/ui/Button";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const SCORE_KEY = "tictactoe_scores";

type Cell = "X" | "O" | null;
type Scores = { X: number; O: number; draw: number };

function loadScores(): Scores {
  try {
    const raw = localStorage.getItem(SCORE_KEY);
    if (raw) return JSON.parse(raw) as Scores;
  } catch { /* ignore */ }
  return { X: 0, O: 0, draw: 0 };
}

function saveScores(s: Scores) {
  try { localStorage.setItem(SCORE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function getWinnerCells(board: Cell[]): number[] {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return [a, b, c];
    }
  }
  return [];
}

export default function TicTacToePage() {
  const navigate = useNavigate();
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState<string>("Your turn — you are X");
  const [gameOver, setGameOver] = useState(false);
  const [scores, setScores] = useState<Scores>(loadScores);
  const [useAgent, setUseAgent] = useState(false);  // Toggle between minimax and LLM agent
  const [reasoning, setReasoning] = useState<string>("");  // Agent's reasoning

  useEffect(() => { saveScores(scores); }, [scores]);

  const winnerCells = getWinnerCells(board);

  const reset = useCallback(() => {
    setBoard(Array(9).fill(null));
    setStatus("Your turn — you are X");
    setGameOver(false);
    setReasoning("");
  }, []);

  const handleClick = async (idx: number) => {
    if (board[idx] || thinking || gameOver) return;

    const newBoard: Cell[] = [...board];
    newBoard[idx] = "X";
    setBoard(newBoard);

    const wCells = getWinnerCells(newBoard);
    if (wCells.length) {
      setStatus("🎉 You win!");
      setScores((s) => ({ ...s, X: s.X + 1 }));
      setGameOver(true);
      return;
    }
    if (newBoard.every((c) => c !== null)) {
      setStatus("🤝 Draw!");
      setScores((s) => ({ ...s, draw: s.draw + 1 }));
      setGameOver(true);
      return;
    }

    setThinking(true);
    const endpoint = useAgent ? "/api/tictactoe/move-agent" : "/api/tictactoe/move";
    setStatus(useAgent ? "🤖 AI is thinking…" : "🤖 Agent is thinking…");
    try {
      const { data } = await axios.post(
        `${API_BASE}${endpoint}`,
        { board: newBoard },
        { withCredentials: true }
      );
      setBoard(data.board);
      
      // Display reasoning if available (from LLM agent)
      if (data.reasoning) {
        setReasoning(data.reasoning);
      } else {
        setReasoning("");
      }
      
      if (data.winner === "O") {
        setStatus("🤖 Agent wins!");
        setScores((s) => ({ ...s, O: s.O + 1 }));
        setGameOver(true);
      } else if (data.draw) {
        setStatus("🤝 Draw!");
        setScores((s) => ({ ...s, draw: s.draw + 1 }));
        setGameOver(true);
      } else {
        setStatus("Your turn — you are X");
      }
    } catch {
      setStatus("⚠️ Error — try again");
    } finally {
      setThinking(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-canvas)] px-4 py-10">
      {/* Header */}
      <div className="mb-8 flex w-full max-w-sm items-center justify-between gap-4">
        <Button
          type="button"
          onClick={() => navigate("/chat")}
          variant="secondary"
          size="sm"
        >
          ← Workspace
        </Button>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Tic Tac Toe Lab</h1>
        <div className="w-20" />
      </div>

      {/* Score */}
      <div className="mb-6 flex w-full max-w-sm items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 shadow-[var(--shadow-soft)] text-sm font-medium">
        <span className="text-[var(--color-primary-600)]">You (X): {scores.X}</span>
        <span className="text-[var(--color-text-muted)]">Draw: {scores.draw}</span>
        <span className="text-red-600">Agent (O): {scores.O}</span>
        <button
          type="button"
          onClick={() => setScores({ X: 0, O: 0, draw: 0 })}
          className="ml-auto text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] underline"
        >
          Reset
        </button>
      </div>

      {/* Mode Toggle */}
      <div className="mb-6 w-full max-w-sm flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase">Mode:</span>
        <button
          type="button"
          onClick={() => { setUseAgent(false); reset(); }}
          className={`px-3 py-1 rounded text-xs font-medium transition-all ${
            !useAgent
              ? "bg-[var(--color-primary-600)] text-white"
              : "bg-[var(--color-surface-soft)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
          }`}
        >
          🧮 Standard
        </button>
        <button
          type="button"
          onClick={() => { setUseAgent(true); reset(); }}
          className={`px-3 py-1 rounded text-xs font-medium transition-all ${
            useAgent
              ? "bg-[var(--color-primary-600)] text-white"
              : "bg-[var(--color-surface-soft)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
          }`}
        >
          🤖 AI Agent
        </button>
      </div>

      {/* Status */}
      <p className="mb-6 text-base font-semibold text-[var(--color-text-primary)]">{status}</p>

      {/* Agent Reasoning (if available) */}
      {reasoning && (
        <div className="mb-6 w-full max-w-sm rounded-lg border border-[var(--color-primary-200)] bg-[var(--color-primary-100)] p-4">
          <p className="text-xs font-semibold text-[var(--color-primary-700)] uppercase mb-2">💭 Agent's Reasoning:</p>
          <p className="text-sm text-[var(--color-primary-700)] whitespace-pre-wrap break-words line-clamp-3">
            {reasoning}
          </p>
        </div>
      )}

      {/* Board */}
      <div className="grid grid-cols-3 gap-2 mb-8">
        {board.map((cell, idx) => {
          const isWinCell = winnerCells.includes(idx);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleClick(idx)}
              disabled={!!cell || thinking || gameOver}
              className={`flex h-24 w-24 items-center justify-center rounded-xl border-2 text-4xl font-bold transition-all
                ${cell ? "cursor-default" : "hover:bg-[var(--color-surface-soft)] cursor-pointer"}
                ${isWinCell ? "border-green-500 bg-green-100 dark:bg-green-950" : `border-[var(--color-border)] bg-[var(--color-surface)]`}
                ${cell === "X" ? "text-[var(--color-primary-600)]" : "text-red-600"}
                disabled:opacity-80
              `}
            >
              {cell ?? ""}
            </button>
          );
        })}
      </div>

      {/* New Game */}
      <Button
        type="button"
        onClick={reset}
        variant="primary"
      >
        New Game
      </Button>
    </main>
  );
}
