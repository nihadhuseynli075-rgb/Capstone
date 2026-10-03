import type { ReactNode } from "react";

/**
 * Line icons for the header buttons and the dashboard tiles.
 *
 * They share one drawing grid (24px, 2px round strokes, no fill), the same
 * rules as the menu icon in the header and the icon family in
 * docs/design/asset-brief.md, so a new icon drawn on that grid sits with these.
 * The stroke is `currentColor`, which means an icon takes its colour from the
 * button or tile that holds it and works in both themes without a variant.
 *
 * Icons are decoration: the button or tile around one carries the label, so
 * each is hidden from screen readers. Size comes from the surrounding CSS.
 */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Shown while the page is light. */
export function IconSun() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

/** Shown while the page is dark. */
export function IconMoon() {
  return (
    <Icon>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </Icon>
  );
}

/** A test paper with a tick: start a mock test. */
export function IconTest() {
  return (
    <Icon>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </Icon>
  );
}

/** A clock turning back: tests already taken. */
export function IconHistory() {
  return (
    <Icon>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

/** Two people: friends. */
export function IconFriends() {
  return (
    <Icon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20v-1.5a4.5 4.5 0 0 1 4.5-4.5h4a4.5 4.5 0 0 1 4.5 4.5V20" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18.5 14.3a4.5 4.5 0 0 1 3 4.2V20" />
    </Icon>
  );
}

/** Sliders: language, theme and the other preferences. */
export function IconSettings() {
  return (
    <Icon>
      <path d="M3 6h7M14 6h7M3 12h3M10 12h11M3 18h9M16 18h5" />
      <path d="M12 3.5v5M8 9.5v5M14 15.5v5" />
    </Icon>
  );
}

/** A person in a circle: the student's own profile. */
export function IconProfile() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="9.5" r="3" />
      <path d="M6 18.4a7 7 0 0 1 12 0" />
    </Icon>
  );
}

/** Points the way on a tile that opens a page. */
export function IconChevron() {
  return (
    <Icon>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}
