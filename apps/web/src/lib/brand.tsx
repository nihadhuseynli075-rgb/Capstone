import logoMark from "../assets/exampeak-logo.png";

/**
 * The Exampeak mark, inlined so the header never waits on a network request.
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
 * Which ground the mark is sitting on.
 *
 * `brand` uses the normal blue logo.
 * `light` uses the same logo in white for dark or coloured backgrounds.
 */
export type LogoTone = "brand" | "light";

/** The peak on its own. */
export function LogoMark({
  size = 40,
  tone = "brand"
}: {
  size?: number;
  tone?: LogoTone;
}) {
  return (
    <img
      src={logoMark}
      alt="Exampeak"
      style={{
        width: (size * 100) / 65,
        height: size,
        objectFit: "contain",
        display: "block",

        filter:
          tone === "light"
            ? "brightness(0) invert(1)"
            : "none"
      }}
    />
  );
}

/** Mark and name side by side, for the app header. */
export function Wordmark({
  size = 30
}: {
  size?: number;
}) {
  return (
    <span className="wordmark">
      <LogoMark size={size} />

      <span className="wordmark-text">
        Exampeak
      </span>
    </span>
  );
}

/**
 * Mark above the name, for the auth panel.
 *
 * The name is real text rather than outlines, so it takes the app's own font
 * and stays selectable and readable to a screen reader.
 */
export function LogoStacked({
  size = 56,
  tone = "brand"
}: {
  size?: number;
  tone?: LogoTone;
}) {
  return (
    <span className="wordmark-stacked">
      <LogoMark
        size={size}
        tone={tone}
      />

      <span className="wordmark-text">
        Exampeak
      </span>
    </span>
  );
}