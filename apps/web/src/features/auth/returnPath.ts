import { normalisePath } from "../../app/router";

/**
 * Coming back to the page that asked for a sign-in.
 *
 * A guest presses Sign in on the friends page because they want the friends
 * page. Landing on the dashboard afterwards (or, with Google, on the profile)
 * made them find their way back, and the two ways of signing in did not even
 * agree on where they ended. The page that sends someone to sign in passes
 * itself along as `?next=`, and both ways of signing in end there.
 */

/**
 * The page a sign-in should end on: `next` when it is one of this app's own
 * pages, home otherwise. The sign-in pages themselves are never a place to
 * come back to, and anything not starting with a single "/" is not a route
 * this app wrote: "//somewhere" reads like another site's address.
 */
export function safeReturnPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";

  const route = normalisePath(next.split("?")[0]);
  if (route === "/login" || route === "/register") return "/";

  return next;
}

/** The sign-in or sign-up page, carrying where to come back to. */
export function signInRoute(page: "login" | "register", returnTo: string | null | undefined): string {
  const next = safeReturnPath(returnTo);
  return next === "/" ? `/${page}` : `/${page}?next=${encodeURIComponent(next)}`;
}

/** The route on screen now, query and all, for a sign-in button to come back to. */
export function currentRoute(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}
