import { useEffect, useSyncExternalStore } from "react";

/**
 * A hash router in a dozen lines.
 *
 * The app has six screens and no need for nested layouts or data loaders, so a
 * routing library would be more moving parts than the whole thing is worth.
 * Hash routes also mean any static host serves the app without rewrite rules.
 */
function currentPath(): string {
  // The query is not part of the route: "/build?subject=math" is still "/build".
  return normalisePath(window.location.hash.replace(/^#/, "").split("?")[0]);
}

/**
 * The route an address means, with the harmless differences taken out: a
 * doubled slash, a slash on the end, and capital letters. "#/Build/" and
 * "#//build" are someone's way of writing "#/build", and showing them a page
 * that does not exist would be unkind. Only the route is tidied; the address
 * bar is left as it was typed.
 */
export function normalisePath(raw: string): string {
  let path = `/${raw}`.replace(/\/{2,}/g, "/").toLowerCase();
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

/** One value from the route's query, e.g. `subject` in "#/build?subject=math". */
function routeParam(name: string): string | null {
  const hash = window.location.hash;
  const start = hash.indexOf("?");
  if (start === -1) return null;
  return new URLSearchParams(hash.slice(start + 1)).get(name);
}

/** Lets React re-read the address whenever it changes. */
function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/*
 * Where each page was scrolled to.
 *
 * Every route change used to jump to the top, Back included, so returning to
 * a long history list or the builder meant scrolling down again from the
 * start. Now each history entry keeps its own scroll position in its state:
 * a new page (a link, a button, an address typed in) has no saved position
 * and opens at the top, and an entry returned to with Back or Forward is put
 * back where it was. The browser's own restoration is switched off because
 * it runs before the page has drawn its content, which mostly arrives later
 * from the API, and so it lands short or at the top anyway.
 */
window.history.scrollRestoration = "manual";

function entryState(): Record<string, unknown> {
  const state: unknown = window.history.state;
  return state && typeof state === "object" ? (state as Record<string, unknown>) : {};
}

function savedScroll(): number | null {
  const value = entryState().scrollY;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Writes the current scroll position into the history entry on screen. */
function rememberScroll(): void {
  window.clearTimeout(scrollTimer);

  try {
    window.history.replaceState({ ...entryState(), scrollY: Math.round(window.scrollY) }, "");
  } catch {
    // Safari limits how often an entry can be rewritten. Missing one write
    // costs only this position.
  }
}

// Written once scrolling settles rather than on every frame, which is both
// cheaper and inside the rewrite limit. A click on an in-app link writes it
// at once, in case it comes before scrolling has settled.
let scrollTimer = 0;

window.addEventListener(
  "scroll",
  () => {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(rememberScroll, 150);
  },
  { passive: true }
);

document.addEventListener(
  "click",
  (event) => {
    if ((event.target as Element | null)?.closest?.('a[href^="#"]')) rememberScroll();
  },
  true
);

/** Counts route changes, so a restore still running for an older one gives up. */
let routeTurn = 0;

/**
 * Scrolls back to `target`, waiting for the page to grow tall enough to get
 * there: the history list, for one, is still loading when the page first
 * draws. Gives up after two seconds, on the next route change, or as soon as
 * the student scrolls or types, since by then they have taken over.
 */
function restoreScroll(target: number): void {
  const turn = routeTurn;
  const deadline = performance.now() + 2000;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
  };
  const events = ["wheel", "touchstart", "keydown"] as const;
  for (const name of events) window.addEventListener(name, interrupt, { passive: true });

  function step() {
    if (!interrupted && turn === routeTurn) {
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) > 1 && performance.now() < deadline) {
        window.requestAnimationFrame(step);
        return;
      }
    }

    for (const name of events) window.removeEventListener(name, interrupt);
  }

  step();
}

export function navigate(path: string): void {
  rememberScroll();
  window.location.hash = path;
}

/**
 * Swaps the whole address for `path`, without adding a step to the history.
 *
 * For tidying up after a sign-in redirect, which leaves its result in the
 * query string and the hash. Going back should not land on that. Replacing
 * the address raises no event of its own, so one is sent for useRoute. The
 * scroll position saved for the old address is not the new one's.
 */
export function replaceRoute(path: string): void {
  const { scrollY: _old, ...rest } = entryState();
  window.history.replaceState(rest, "", `${window.location.pathname}#${path}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useRoute(): string {
  const path = useSyncExternalStore(subscribeToHash, currentPath);

  useEffect(() => {
    routeTurn += 1;

    const saved = savedScroll();
    if (saved === null) window.scrollTo(0, 0);
    else restoreScroll(saved);
  }, [path]);

  return path;
}

/**
 * One value from the route's query, kept up to date as the address changes.
 *
 * The query is not part of the route, so moving from "/build?subject=math" to
 * "/build?subject=english" keeps the same page mounted: a value read once when
 * the page loaded would still say "math".
 */
export function useRouteParam(name: string): string | null {
  return useSyncExternalStore(subscribeToHash, () => routeParam(name));
}
