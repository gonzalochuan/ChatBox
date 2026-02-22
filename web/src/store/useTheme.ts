import { create } from "zustand";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const readInitial = (): Theme => {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved as Theme;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? "dark" : "light";
  } catch {
    return "dark";
  }
};

const applyClass = (t: Theme) => {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.remove("dark", "light");
  el.classList.add(t);
};

export const useTheme = create<ThemeState>((set, get) => ({
  theme: readInitial(),
  setTheme: (t) => {
    applyClass(t);
    try { localStorage.setItem("theme", t); } catch {}
    set({ theme: t });
  },
  toggle: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    get().setTheme(next);
  },
}));
