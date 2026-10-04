import { useEffect, useSyncExternalStore } from "react";

/**
 * A hash router in a dozen lines.
 *
 * The app has six screens and no need for nested layouts or data loaders, so a
 * routing library would be more moving parts than the whole thing is worth.
 * Hash routes also mean any static host serves the app without rewrite rules.
 */
function pathOfHash(hash: string): string {
  // The query is not part of the route: "/build?subject=math" is still "/build".
  const path = hash.replace(/^#/, "").split("?")[0];
  return path.length > 0 ? path : "/";
}

function currentPath(): string {
  return pathOfHash(window.location.hash);
}

/**
 * Something that must be asked before the student leaves the page: the test in
 * progress. It is told where the address is going and answers whether to go.
 */
export type LeaveGuard = (to: string) => boolean;

let leaveGuard: LeaveGuard | null = null;

/** The address last let through, to put back when the guard says no. */
let allowedHash = window.location.hash;

/** Set by navigateAway, whose change has already been asked about. */
let alreadyAsked = false;

/** Sets the guard; the function returned takes it away again (an effect's cleanup). */
export function setLeaveGuard(guard: LeaveGuard): () => void {
  leaveGuard = guard;
  return () => {
    if (leaveGuard === guard) leaveGuard = null;
  };
}

// Every change of address passes through here first: in the capture phase on
// the window, ahead of useRoute's own listeners. A change the guard refuses
// is undone and stopped there, so the page never hears of it. Asking from
// inside the page instead came too late: the browser's Back re-rendered the
// page away, guard and all, before the guard's own listener was reached.
//
// Undoing it replaces the step the browser moved to with the page that was
// left, since an address change cannot be cancelled outright.
window.addEventListener(
  "hashchange",
  (event) => {
    const to = currentPath();
    const asked = alreadyAsked;
    alreadyAsked = false;

    if (!asked && leaveGuard && to !== pathOfHash(allowedHash) && !leaveGuard(to)) {
      event.stopImmediatePropagation();
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}${allowedHash}`
      );
      return;
    }

    allowedHash = window.location.hash;
  },
  true
);

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

export function navigate(path: string): void {
  window.location.hash = path;
}

/**
 * Goes to `path` from a link that knows it leaves the page, asking the guard
 * first. Asking here, before the address changes, means a "no" leaves the
 * history as it was, where a refused change of address can only be put back.
 */
export function navigateAway(path: string): void {
  if (path === currentPath()) return;
  if (leaveGuard && !leaveGuard(path)) return;

  alreadyAsked = true;
  navigate(path);
}

/**
 * Swaps the whole address for `path`, without adding a step to the history.
 *
 * For tidying up after a sign-in redirect, which leaves its result in the
 * query string and the hash. Going back should not land on that. Replacing
 * the address raises no event of its own, so one is sent for useRoute.
 */
export function replaceRoute(path: string): void {
  window.history.replaceState(window.history.state, "", `${window.location.pathname}#${path}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useRoute(): string {
  const path = useSyncExternalStore(subscribeToHash, currentPath);

  useEffect(() => {
    window.scrollTo(0, 0);
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
