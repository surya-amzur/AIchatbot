import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import Button from "../ui/Button";
import { getTheme, toggleTheme } from "../../lib/theme";

type Tab = {
  key: string;
  label: string;
  active?: boolean;
  onClick: () => void;
};

type AppShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  tabs?: Tab[];
  actions?: React.ReactNode;
};

function AppShell({ title, subtitle, children, tabs = [], actions }: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setThemeState] = useState<"light" | "dark">(getTheme());
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const switchTheme = () => {
    const next = toggleTheme();
    setThemeState(next);
  };

  const navItems = [
    { to: "/chat", label: "Workspace" },
    { to: "/research", label: "Agents" },
    { to: "/tictactoe", label: "Tic" },
  ];

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-text-primary)]">
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/80">
        {/* Top navigation bar */}
        <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-2 px-3 md:gap-3 md:px-6">

          {/* Title + subtitle + tabs — left side */}
          {title ? (
            <div className="hidden md:flex items-center gap-2 shrink-0">
              <div className="flex flex-col gap-0">
                <h1 className="text-xs font-semibold leading-tight">{title}</h1>
                {subtitle ? (
                  <p className="text-[9px] leading-tight text-[var(--color-text-secondary)]">{subtitle}</p>
                ) : null}
              </div>
              {tabs.length > 0 ? (
                <div className="flex flex-nowrap gap-0.5 ml-2 pl-2 border-l border-[var(--color-border)]" role="tablist" aria-label="Section modes">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={tab.onClick}
                      role="tab"
                      aria-selected={Boolean(tab.active)}
                      className={`rounded-lg px-2 py-0.5 text-xs font-medium transition-colors whitespace-nowrap ${
                        tab.active
                          ? "bg-[var(--color-primary-600)] text-white"
                          : "bg-[var(--color-surface-soft)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
            {navItems.map((item) => {
              const active = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-[var(--color-primary-100)] text-[var(--color-primary-700)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="relative hidden w-full max-w-xs 2xl:block">
            <input
              ref={searchRef}
              type="search"
              placeholder="Search threads, papers, datasets..."
              className="h-8 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 pr-14 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-primary-500)] focus:ring-2 focus:ring-[var(--color-primary-200)] transition"
            />
            <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded border border-[var(--color-border)] px-1 py-0.5 text-[9px] text-[var(--color-text-muted)] font-medium">
              Ctrl+K
            </span>
          </div>

          {/* Spacer pushes everything after it to the right */}
          <div className="flex-1" />

          <Button type="button" size="sm" variant="ghost" onClick={switchTheme}>
            {theme === "dark" ? "☀️" : "🌙"}
          </Button>

          {actions}
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-3 py-2 md:px-6 md:py-3">{children}</div>
    </main>
  );
}

export default AppShell;
