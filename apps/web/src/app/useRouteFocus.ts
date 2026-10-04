import { useEffect } from "react";

/**
 * Moves focus to the new page's heading after every change of route.
 *
 * A hash route swaps the page without a page load, so focus stayed on the
 * button that was pressed (or fell to the body when that button went away).
 * A screen reader announced nothing, and the next Tab carried on from the
 * middle of the new page: after finishing a test it landed on the "only
 * mistakes" box, past the score. The first page of a visit is left alone,
 * since a real page load already starts a screen reader at the top.
 *
 * Several pages draw their heading only once their data or session has been
 * read, so this looks for it for up to a second. It gives up if the student
 * has moved focus somewhere themselves in the meantime.
 */
/*
 * The route focus was last placed for, kept outside React: development's
 * strict mode runs every effect twice on mount, and a flag in a ref read the
 * second run as a route change and took focus on the first page too.
 */
let settledPath: string | null = null;

export function useRouteFocus(path: string): void {
  useEffect(() => {
    const first = settledPath === null;
    const same = settledPath === path;
    settledPath = path;
    if (first || same) return;

    // Where focus was when the route changed: the control that changed it,
    // or the body once that control has been taken off the page.
    const startedOn = document.activeElement;
    const deadline = performance.now() + 1000;
    let frame = 0;

    function step() {
      const focused = document.activeElement;
      const untouched = focused === startedOn || focused === document.body || focused === null || !focused.isConnected;
      if (!untouched) return;

      // The page's own heading; the main area when a page has none yet.
      const target =
        document.querySelector<HTMLElement>("main h1, h1") ??
        (performance.now() > deadline ? document.querySelector<HTMLElement>("main") : null);

      if (target) {
        // Focusable by script only, so it never becomes a Tab stop, and marked
        // so the stylesheet can leave the heading without a focus ring: it is
        // a place to start reading, not a control.
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.classList.add("route-focus");
        target.focus({ preventScroll: true });
        return;
      }

      frame = window.requestAnimationFrame(step);
    }

    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [path]);
}
