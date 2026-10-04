import { useSyncExternalStore } from "react";

const STORAGE_KEY = "examPeak.theme";

export type Theme = "light" | "dark";

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

/** The theme the student picked on this device, or null if they never have. */
function storedChoice(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return systemDark.matches ? "dark" : "light";
}

export function getStoredTheme(): Theme {
  return storedChoice() ?? systemTheme();
}

/**
 * The page background in each theme, for the browser's own bar on a phone.
 * The same two colours are in index.html, whose script sets them first.
 */
const THEME_COLOURS: Record<Theme, string> = { light: "#f4f8fc", dark: "#07202f" };

/**
 * Puts a theme on the page. Only that: storing it is left to setTheme, the
 * one place a student actually chooses. Writing it here as well wrote the
 * system's setting down on the first visit, and from then on the site kept
 * that theme however the phone or computer was switched afterwards.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  // index.html sets this before the first paint, and an inline style outranks
  // the stylesheet's, so it has to follow every change from here on.
  root.style.colorScheme = theme;

  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = THEME_COLOURS[theme];
  }
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

function change(theme: Theme): void {
  if (readTheme() === theme) return;

  currentTheme = theme;
  applyTheme(theme);
  for (const listener of [...listeners]) listener();
}

/** A student's own choice, kept on this device from now on. */
export function setTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage refused: the choice still holds until the page is closed.
  }

  change(theme);
}

// Until the student picks a theme, the site follows the system's setting,
// including when it changes while the page is open (an evening switch to
// dark mode, say). Once they have picked one, that choice wins.
systemDark.addEventListener("change", () => {
  if (storedChoice() === null) change(systemTheme());
});

/** Reads the current theme and re-renders the caller whenever it changes. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, readTheme, readTheme);
  return [theme, setTheme];
}
