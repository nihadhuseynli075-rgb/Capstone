import { useId } from "react";

/**
 * The Exampeak mark, inlined so the header never waits on a network request.
 *
 * The artwork is a peak drawn as the pages of an open book: a solid triangle
 * with a rounded summit, and white channels fanning down the right face. The
 * topmost channel curls back over the summit, which is what makes the peak read
 * as a book spine rather than a plain mountain.
 *
 * Three lockups, because the artwork comes in three and each has a job:
 * the mark alone is the only version a browser tab can render at 16 pixels,
 * the horizontal lockup fits a header bar, and the stacked one suits a centred
 * panel where there is height to spare.
 */

export const brandColors = {
  /** The peak blue. */
  blue: "#0C82C8",
  /** The wordmark navy. */
  navy: "#0A3A58"
} as const;

/**
 * The mark's geometry, drawn once on a 100 x 65 grid.
 *
 * Kept in one place so the mark cannot drift between the lockups. Each channel
 * leaves the ridge at its own height and runs almost straight to the base, so
 * the right face reads as the fanned pages of a book rather than a spray from
 * a single point.
 */
const PEAK = "M 1 64 L 51 9 C 53.5 4, 60 4.5, 61.5 10 L 99 64 Z";

const CHANNELS = [
  // Curls back over the summit before descending: the spine of the book.
  "M 47.5 29 C 47 19, 49 10.5, 54 10.5 C 58.8 10.5, 59.6 14.5, 59 18.5 Q 60.5 41, 64 64",
  "M 59.5 15 Q 65 40, 73 64",
  "M 61 19 Q 70 42, 82 64",
  "M 62.5 23 Q 75.5 44, 91 64"
];

/**
 * Which ground the mark is sitting on.
 *
 * `brand` is the artwork as drawn: a blue peak with white channels, for a page
 * or card background. `light` reverses it to a white peak for a coloured panel,
 * and punches the channels out rather than painting them, so whatever is behind
 * shows through -- the auth panel is a gradient, and no single channel colour
 * could match it.
 */
export type LogoTone = "brand" | "light";

/** The peak on its own. Width follows from the height at the artwork's ratio. */
export function LogoMark({ size = 40, tone = "brand" }: { size?: number; tone?: LogoTone }) {
  // Two marks can share a page, and two <mask> elements cannot share an id.
  const maskId = useId();

  return (
    <svg
      width={(size * 100) / 65}
      height={size}
      viewBox="0 0 100 65"
      role="img"
      aria-label="Exampeak"
      focusable="false"
    >
      {tone === "light" ? (
        <>
          <mask id={maskId}>
            <path d={PEAK} fill="#FFFFFF" />
            <g stroke="#000000" strokeLinecap="round" strokeWidth="2.1" fill="none">
              {CHANNELS.map((channel) => (
                <path key={channel} d={channel} />
              ))}
            </g>
          </mask>
          <path d={PEAK} fill="#FFFFFF" mask={`url(#${maskId})`} />
        </>
      ) : (
        <>
          <path d={PEAK} fill={brandColors.blue} />
          <g stroke="#FFFFFF" strokeLinecap="round" strokeWidth="2.1" fill="none">
            {CHANNELS.map((channel) => (
              <path key={channel} d={channel} />
            ))}
          </g>
        </>
      )}
    </svg>
  );
}

/** Mark and name side by side, for the app header. */
export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <span className="wordmark">
      <LogoMark size={size} />
      <span className="wordmark-text">Exampeak</span>
    </span>
  );
}

/**
 * Mark above the name, for the auth panel.
 *
 * The name is real text rather than outlines, so it takes the app's own font
 * and stays selectable and readable to a screen reader.
 */
export function LogoStacked({ size = 56, tone = "brand" }: { size?: number; tone?: LogoTone }) {
  return (
    <span className="wordmark-stacked">
      <LogoMark size={size} tone={tone} />
      <span className="wordmark-text">Exampeak</span>
    </span>
  );
}
