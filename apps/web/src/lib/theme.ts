import { useSyncExternalStore } from "react";

const STORAGE_KEY = "examPeak.theme";

export type Theme = "light" | "dark";

export function getStoredTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(STORAGE_KEY, theme);
}

/**
 * One theme, shared by everything that can change it.
 *
 * The header toggle and the Settings page both set the theme. When each kept
 * its own copy in component state, changing it in Settings left the header
 * holding the old value: its label described the wrong theme, and its next
 * click re-applied the theme already showing, so the first click did nothing.
 *
 * A single module-level value with subscribers keeps them in step, and survives
 * navigation between screens because it does not live in a component.
 */
let currentTheme: Theme | null = null;
const listeners = new Set<() => void>();

function readTheme(): Theme {
  if (currentTheme === null) currentTheme = getStoredTheme();
  return currentTheme;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setTheme(theme: Theme): void {
  if (readTheme() === theme) return;

  currentTheme = theme;
  applyTheme(theme);
  for (const listener of [...listeners]) listener();
}

/** Reads the current theme and re-renders the caller whenever it changes. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, readTheme, readTheme);
  return [theme, setTheme];
}
