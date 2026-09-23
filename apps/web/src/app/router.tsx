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
  const path = window.location.hash.replace(/^#/, "").split("?")[0];
  return path.length > 0 ? path : "/";
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

export function navigate(path: string): void {
  window.location.hash = path;
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
