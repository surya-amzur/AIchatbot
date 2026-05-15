const THEME_KEY = "amzur_theme";

type Theme = "light" | "dark";

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("theme-dark", theme === "dark");
  root.setAttribute("data-theme", theme);
}

export function initializeTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const saved = window.localStorage.getItem(THEME_KEY);
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme: Theme = saved === "dark" || saved === "light" ? saved : systemPrefersDark ? "dark" : "light";
  applyTheme(theme);
  return theme;
}

export function setTheme(theme: Theme): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function getTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }
  const rootTheme = document.documentElement.getAttribute("data-theme");
  return rootTheme === "dark" ? "dark" : "light";
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
