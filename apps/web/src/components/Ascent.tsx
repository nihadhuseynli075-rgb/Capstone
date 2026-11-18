import { useId } from "react";
import "../styles/ascent.css";

/**
 * "The Ascent": a student's finished tests drawn as a mountain ridge, in the
 * logo's shape (a peak whose slope carries the lines of a book's pages).
 *
 * Each test is a point on the ridge: oldest on the left, height is the score
 * in percent. The best test carries a summit flag and the first one a base-camp
 * tent, so improving reads as climbing, which is the measure of success the
 * project set itself ("come back to a second test that shows they improved").
 *
 * The ridge is one SVG stretched to the box (`preserveAspectRatio="none"`, with
 * strokes that do not stretch), and the markers are HTML laid over it by
 * percentage, so the flag and tent keep their shape at any width. No words are
 * drawn inside the SVG: every label arrives translated from the caller.
 */

export interface AscentPoint {
  id: string;
  /** Score in percent, 0 to 100. */
  percent: number;
  /** Read in the hover card, and the point's name when it can be pressed. */
  label: string;
}

interface ChartProps {
  variant: "full" | "compact";
  points: AscentPoint[];
  /** Chosen by the caller with attemptScoreValue, so it always agrees with "best test so far". */
  bestId?: string;
  /** Shown when there are no points: the base camp on its own. */
  emptyLabel: string;
  /** Pressing a point (full variant only). */
  onSelect?: (id: string) => void;
}

/** One stage on the landing's climb: its title, and a line under it when the page has one. */
export interface PathStep {
  title: string;
  note?: string;
}

interface PathProps {
  variant: "path";
  /** The three stages of a test, already translated: build, sit, review. */
  steps: [PathStep, PathStep, PathStep];
  /** A stage still to come (Daily Quizzes): a dashed stop after the three, with its badge. */
  soon?: { title: string; badge: string };
}

interface BandProps {
  variant: "band";
  /** The 404's version: the climb line stops short and the flag is not reached. */
  short?: boolean;
}

type AscentProps = ChartProps | PathProps | BandProps;

/** Where a point sits in the 100 x 100 drawing box. */
interface Spot {
  x: number;
  y: number;
}

// The ridge never touches the top or the bottom of its box: the flag needs room
// above the highest point, and a score of 0 still sits on the slope, not in the
// ground.
const TOP = 14;
const BOTTOM = 88;
const SIDE = 7;

function spotsFor(points: AscentPoint[]): Spot[] {
  const span = 100 - SIDE * 2;

  return points.map((point, index) => {
    const percent = Math.min(100, Math.max(0, point.percent));
    return {
      x: points.length === 1 ? 50 : SIDE + (span * index) / (points.length - 1),
      y: BOTTOM - ((BOTTOM - TOP) * percent) / 100
    };
  });
}

/** The filled mountain under a line of spots, from the ground on the left to the ground on the right. */
function ridgeShape(spots: Spot[]): string {
  const line = spots.map((spot) => `L${spot.x.toFixed(2)},${spot.y.toFixed(2)}`).join(" ");
  return `M0,100 L0,96 ${line} L100,96 L100,100 Z`;
}

function ridgeLine(spots: Spot[]): string {
  return spots.map((spot, index) => `${index === 0 ? "M" : "L"}${spot.x.toFixed(2)},${spot.y.toFixed(2)}`).join(" ");
}

/**
 * A paler, lower range behind the first, the depth the logo has. Each valley
 * between two tests is filled in a little higher than the front one, so the
 * back range shows through the dips and a short climb is not a bare triangle.
 */
function backRange(spots: Spot[]): Spot[] {
  const back: Spot[] = [];

  spots.forEach((spot, index) => {
    back.push({ x: spot.x, y: spot.y + (96 - spot.y) * 0.25 });

    const next = spots[index + 1];
    if (next) {
      // A gentle rise above the straight line between the two, not a spike.
      back.push({ x: (spot.x + next.x) / 2, y: (spot.y + next.y) / 2 - 5 });
    }
  });

  return back;
}

function Flag() {
  return (
    <svg viewBox="0 0 20 24" aria-hidden="true" focusable="false">
      <path d="M4 23V2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 3h12l-3 4.5 3 4.5H5z" fill="currentColor" />
    </svg>
  );
}

function Tent() {
  return (
    <svg viewBox="0 0 24 20" aria-hidden="true" focusable="false">
      <path d="M2 19L12 3l10 16z" fill="currentColor" />
      <path d="M12 9l-3.5 10h7z" fill="var(--surface)" />
    </svg>
  );
}

/** The ridge drawing itself: back range, front range, the climb line and the book's page lines. */
function Ridge({
  spots,
  gradientId,
  pages = false,
  lineUntil
}: {
  spots: Spot[];
  gradientId: string;
  pages?: boolean;
  /** Draw the climb line only up to this spot (the 404's path that stops short). */
  lineUntil?: number;
}) {
  const summit = spots.reduce((top, spot) => (spot.y < top.y ? spot : top), spots[0]);
  const revealId = `${gradientId}-reveal`;

  return (
    <svg className="ascent-ridge" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--ascent-peak)" />
          <stop offset="1" stopColor="var(--ascent-foot)" />
        </linearGradient>

        {/* What the climb line is seen through: the whole drawing, which
            grows in from the left edge as the page opens (see .ascent-reveal
            in ascent.css). */}
        <clipPath id={revealId}>
          <rect className="ascent-reveal" x="0" y="0" width="100" height="100" />
        </clipPath>
      </defs>

      <path className="ascent-back" d={ridgeShape(backRange(spots))} />
      <path d={ridgeShape(spots)} fill={`url(#${gradientId})`} />

      {/* The logo's three page lines, on the slope just below the summit. Only
          on the landing's drawing: on a chart they read as marks on the data. */}
      {pages &&
        [0, 1, 2].map((line) => (
          <path
            key={line}
            className="ascent-pages"
            d={`M${summit.x + 1.5 + line * 2.2},${summit.y + 10 + line * 7} l${4},${2.5}`}
            vectorEffect="non-scaling-stroke"
          />
        ))}

      <path
        className="ascent-line"
        d={ridgeLine(lineUntil === undefined ? spots : spots.slice(0, lineUntil + 1))}
        clipPath={`url(#${revealId})`}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Ascent(props: AscentProps) {
  const gradientId = `ascent-${useId().replace(/:/g, "")}`;

  if (props.variant === "path") {
    return <AscentPath steps={props.steps} soon={props.soon} gradientId={gradientId} />;
  }

  if (props.variant === "band") {
    return <AscentBand short={props.short ?? false} gradientId={gradientId} />;
  }

  const { variant, points, bestId, emptyLabel, onSelect } = props;

  if (points.length === 0) {
    return (
      <div className={`ascent ascent-${variant} is-empty`}>
        <div className="ascent-canvas">
          <svg className="ascent-ridge" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path className="ascent-back" d="M0,100 L0,92 L30,80 L62,88 L100,74 L100,100 Z" />
          </svg>
          <span className="ascent-marker is-camp is-alone" style={{ left: "22%", top: "84%" }}>
            <Tent />
          </span>
        </div>
        <p className="ascent-empty">{emptyLabel}</p>
      </div>
    );
  }

  const spots = spotsFor(points);
  const interactive = variant === "full" && Boolean(onSelect);

  return (
    // The drawing is hidden from screen readers: the page lists every test
    // as text right beside it, and that list is the way to reach them.
    <div className={`ascent ascent-${variant}`} aria-hidden="true">
      <div className="ascent-canvas">
        <Ridge spots={spots} gradientId={gradientId} />

        <span className="ascent-marker is-camp" style={{ left: `${spots[0].x}%`, top: `${spots[0].y}%` }}>
          <Tent />
        </span>

        {points.map((point, index) => {
          const spot = spots[index];
          const isBest = point.id === bestId;
          const position = { left: `${spot.x}%`, top: `${spot.y}%` };
          // Cards near the right edge open leftwards so they never leave the screen.
          const side = spot.x > 66 ? "is-left" : spot.x < 34 ? "is-right" : "";

          return (
            <span key={point.id} className={`ascent-point ${isBest ? "is-best" : ""} ${side}`} style={position}>
              {isBest && (
                <span className="ascent-flag">
                  <Flag />
                </span>
              )}

              {interactive ? (
                <button type="button" tabIndex={-1} className="ascent-dot" onClick={() => onSelect?.(point.id)}>
                  <span className="ascent-tip">{point.label}</span>
                </button>
              ) : (
                <span className="ascent-dot" />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The landing page's version: no scores at all, only the shape of the climb and
 * the three stages of a test as camps on the way up. A visitor has taken no
 * tests, and a chart of made-up results would be a claim the site cannot back.
 */
/** The landing climb's ridge, shared by the band and the path variants. */
const climbSpots: Spot[] = [
  { x: 8, y: 84 },
  { x: 24, y: 70 },
  { x: 34, y: 76 },
  { x: 52, y: 46 },
  { x: 62, y: 54 },
  { x: 80, y: 16 },
  { x: 92, y: 44 }
];
const SUMMIT = 5;
const SHORT_STOP = 3;

/**
 * The ridge alone, for the navy band that opens the privacy, terms and 404
 * pages: the same climb as the landing page, with the flag at the summit. On
 * the 404 the line stops short at a camp and the flag stands unreached.
 * Decoration only: the band's own heading says what the page is.
 */
function AscentBand({ short, gradientId }: { short: boolean; gradientId: string }) {
  const summit = climbSpots[SUMMIT];
  const stop = climbSpots[SHORT_STOP];

  return (
    <div className={`ascent ascent-band ${short ? "is-short" : ""}`} aria-hidden="true">
      <div className="ascent-canvas">
        <Ridge spots={climbSpots} gradientId={gradientId} pages lineUntil={short ? SHORT_STOP : undefined} />

        <span className="ascent-point is-best" style={{ left: `${summit.x}%`, top: `${summit.y}%` }}>
          <span className="ascent-flag">
            <Flag />
          </span>
          <span className="ascent-dot" />
        </span>

        {short && (
          <span className="ascent-point is-end" style={{ left: `${stop.x}%`, top: `${stop.y}%` }}>
            <span className="ascent-dot" />
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A hyphen inside a word ("past-paper", "exam-style") drawn as a non-breaking
 * one, so a narrow screen breaks the line between words instead.
 */
function keepHyphenated(text: string): string {
  return text.replace(/(\p{L})-(\p{L})/gu, "$1\u2011$2");
}

function AscentPath({
  steps,
  soon,
  gradientId
}: {
  steps: [PathStep, PathStep, PathStep];
  soon?: { title: string; badge: string };
  gradientId: string;
}) {
  const spots = climbSpots;
  const camps = [spots[1], spots[3], spots[5]];

  return (
    <figure className="ascent ascent-path">
      <div className="ascent-canvas">
        <Ridge spots={spots} gradientId={gradientId} pages />

        {camps.map((camp, index) => (
          <span
            key={index}
            className={`ascent-point is-step ${index === 2 ? "is-best" : ""}`}
            style={{ left: `${camp.x}%`, top: `${camp.y}%` }}
            aria-hidden="true"
          >
            {index === 2 && (
              <span className="ascent-flag">
                <Flag />
              </span>
            )}
            {/* Numbered like the list below, which carries the words. */}
            <span className="ascent-dot is-numbered">{index + 1}</span>
          </span>
        ))}
      </div>

      {/* The stages are real text in reading order, so they are also the
          figure's description for a screen reader. */}
      <figcaption>
        <ol className="ascent-steps">
          {steps.map((step, index) => (
            <li key={index}>
              <span className="ascent-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="ascent-step-text">
                <span className="ascent-step-title">{keepHyphenated(step.title)}</span>
                {step.note && <span className="ascent-step-note">{keepHyphenated(step.note)}</span>}
              </span>
            </li>
          ))}

          {/* Not built yet: a dashed stop with no number, so it never reads
              as a stage a student can already take. */}
          {soon && (
            <li className="is-soon">
              <span className="ascent-step-number is-soon" aria-hidden="true" />
              <span className="ascent-step-text is-soon">
                <span className="ascent-step-title">{soon.title}</span>
                <span className="soon-pill">{soon.badge}</span>
              </span>
            </li>
          )}
        </ol>
      </figcaption>
    </figure>
  );
}
