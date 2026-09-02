/**
 * The Exampeak mark, inlined so the header never waits on a network request.
 *
 * The mountain is drawn as a solid peak with a set of contour strokes sweeping
 * down the right face, matching the supplied artwork. Two variants exist on
 * purpose: the icon alone is what a browser tab can actually render at 16
 * pixels, while the wordmark is for the app header and anywhere the name needs
 * to appear alongside it.
 */

export const brandColors = {
  /** The mountain blue. */
  blue: "#1287C9",
  /** The wordmark navy. */
  navy: "#0E3A4F"
} as const;

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Exampeak"
      focusable="false"
    >
      {/* The peak. */}
      <path d="M32 8 L60 56 L4 56 Z" fill={brandColors.blue} />
      {/*
        Contour strokes fanning from the summit down the right face. Each one
        bows away from the ridge and lands further along the base, so they
        spread rather than running parallel; the stroke thins as it goes for
        the same reason.
      */}
      <g stroke="#FFFFFF" strokeLinecap="round" fill="none">
        <path d="M33 11 C36 26 39 42 41 56" strokeWidth="2.4" />
        <path d="M34 13 C39 27 43 43 46 56" strokeWidth="2" />
        <path d="M35 16 C41 29 47 44 51 56" strokeWidth="1.6" />
        <path d="M36 19 C43 32 50 45 55 56" strokeWidth="1.2" />
      </g>
    </svg>
  );
}

export function Wordmark({ size = 32 }: { size?: number }) {
  return (
    <span className="wordmark">
      <LogoMark size={size} />
      <span className="wordmark-text">Exampeak</span>
    </span>
  );
}
