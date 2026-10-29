import type { ReactNode } from "react";

/**
 * ExamPeak icons for header buttons, dashboard tiles and profile actions.
 *
 * This bespoke line-plus-fill family echoes the logo through climbing ridges,
 * folded pages and a summit flag. Each drawing uses a 24px grid, 2px round
 * currentColor strokes and one soft currentColor fill at 18% opacity; the menu
 * uses lines only. The family follows docs/design/asset-brief.md and inherits
 * its colour from the surrounding UI, so both themes use the same drawings.
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

/** A sun with eight short rays: the light theme. */
export function IconSun() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.18" stroke="none" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" />
    </Icon>
  );
}

/** A broad crescent with a gently curled tip: the dark theme. */
export function IconMoon() {
  return (
    <Icon>
      <path d="M13 3C7 2 3 6 3 12a9 9 0 0 0 18 1c-2 2-5 2-7 0s-3-6-1-10Z" fill="currentColor" opacity="0.18" stroke="none" />
      <path d="M13 3C7 2 3 6 3 12a9 9 0 0 0 18 1c-2 2-5 2-7 0s-3-6-1-10Z" />
    </Icon>
  );
}

/** A folded test sheet and a rising tick: start a mock test. */
export function IconTest() {
  return (
    <Icon>
      <path d="M14 3v6h6Z" fill="currentColor" opacity="0.18" stroke="none" />
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
      <path d="M14 3v6h6M8 14l3 3 5-5" />
    </Icon>
  );
}

/** A returning clock with ridge-shaped hands: previous climbs. */
export function IconHistory() {
  return (
    <Icon>
      <path d="M7.5 15l4.5-3 4.5 3Z" fill="currentColor" opacity="0.18" stroke="none" />
      <path d="M3 8a9 9 0 1 1 0 8M3 3v5h5" />
      <path d="M7.5 15l4.5-3 4.5 3" />
    </Icon>
  );
}

/** Two people with arched shoulders, one smaller behind: friends. */
export function IconFriends() {
  return (
    <Icon>
      <circle cx="17" cy="7" r="2.5" />
      <path d="M16 12a5 5 0 0 1 6 5v1" />
      <circle cx="8" cy="8" r="3" />
      <path d="M2 20v-2a6 6 0 0 1 12 0v2" />
    </Icon>
  );
}

/** A peak knob and a round knob: tune personal preferences. */
export function IconSettings() {
  return (
    <Icon>
      <path d="M3 11l3-5 3 5Z" fill="currentColor" opacity="0.18" stroke="none" />
      <path d="M6 3v3m0 5v10M18 3v10m0 6v2M3 11l3-5 3 5Z" />
      <circle cx="18" cy="16" r="3" />
    </Icon>
  );
}

/** One person against a soft circle: their profile. */
export function IconProfile() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.18" stroke="none" />
      <circle cx="12" cy="8" r="3" />
      <path d="M6 19a6 6 0 0 1 12 0" />
    </Icon>
  );
}

/** A clean rounded chevron pointing right: move to the next page. */
export function IconChevron() {
  return (
    <Icon>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}

/** Three calm menu lines become a cross when the menu is open. */
export function IconMenu({ open }: { open: boolean }) {
  return (
    <Icon>
      <path d={open ? "M5 5l14 14" : "M4 6h16"} />
      <path d={open ? "M5 19L19 5" : "M4 12h16"} />
      <path d="M4 18h16" opacity={open ? 0 : 1} />
    </Icon>
  );
}

/** An envelope with a folded, peak-shaped flap: email details. */
export function IconEmail() {
  return (
    <Icon>
      <path d="M3 18l7.5-6h3l7.5 6Z" fill="currentColor" opacity="0.18" stroke="none" />
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l8 6a1.7 1.7 0 0 0 2 0l8-6" />
    </Icon>
  );
}

/** A welcoming roof over a mountain doorway: return home. */
export function IconHome() {
  return (
    <Icon>
      <path d="M8 21l4-7 4 7Z" fill="currentColor" opacity="0.18" stroke="none" />
      <path d="M3 11l9-8 9 8M5 10v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9" />
      <path d="M8 21l4-7 4 7" />
    </Icon>
  );
}

/** An inward arrow through a folded doorway: sign in. */
export function IconSignIn() {
  return (
    <Icon>
      <path d="M15 3v6h6Z" fill="currentColor" opacity="0.18" stroke="none" />
      <path d="M11 3h4l6 6v10a2 2 0 0 1-2 2h-8M15 3v6h6" />
      <path d="M3 12h11m-4-4 4 4-4 4" />
    </Icon>
  );
}

/** An outward arrow from a folded doorway: sign out. */
export function IconSignOut() {
  return (
    <Icon>
      <path d="M8 3v6h6Z" fill="currentColor" opacity="0.18" stroke="none" />
      <path d="M14 9 8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7M8 3v6h6" />
      <path d="M11 14h10m-4-4 4 4-4 4" />
    </Icon>
  );
}
