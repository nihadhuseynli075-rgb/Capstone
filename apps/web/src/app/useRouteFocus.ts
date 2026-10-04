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
 * read, so this keeps looking for a few seconds. It gives up as soon as the
 * student has moved focus somewhere themselves.
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
    const started = performance.now();
    let placed: HTMLElement | null = null;
    let frame = 0;

    function step() {
      const now = performance.now();
      // Kept up for three seconds in all: a page that swaps its loading
      // heading for the loaded one takes focus away with the old heading, and
      // it is handed on to the new one.
      if (now - started > 3000) return;

      const focused = document.activeElement;
      const heading = document.querySelector<HTMLElement>("main h1, h1");
      const ours = placed !== null && focused === placed;
      // Still on what this placed, and nothing better to move to: a main
      // area that was only a stand-in gives way once the heading arrives.
      const settled = ours && !(placed?.tagName === "MAIN" && heading);
      const untouched = focused === startedOn || focused === document.body || focused === null;

      if (settled) {
        // Nothing to do this frame.
      } else if (ours || untouched) {
        // The page's own heading; the main area when a page has none after a
        // second.
        const target = heading ?? (now - started > 1000 ? document.querySelector<HTMLElement>("main") : null);
        if (target) {
          // Focusable by script only, so it never becomes a Tab stop, and
          // marked so the stylesheet can leave it without a focus ring: it is
          // a place to start reading, not a control.
          if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
          target.classList.add("route-focus");
          target.focus({ preventScroll: true });
          placed = target;
        }
      } else {
        // The student has moved on; leave focus where they put it.
        return;
      }

      frame = window.requestAnimationFrame(step);
    }

    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [path]);
}
