/**
 * The ExamPeak mark, inlined so the header never waits on a network request.
 *
 * Two variants exist on purpose: the icon alone is what a browser tab can
 * actually render at 16 pixels, while the wordmark is for the app header and
 * anywhere the name needs to appear alongside it.
 */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="ExamPeak"
      focusable="false"
    >
      <rect width="64" height="64" rx="14" fill="#0B3C6E" />
      <path d="M32 14 L11 47 L32 40 Z" fill="#FFFFFF" />
      <path d="M32 14 L53 47 L32 40 Z" fill="#4DA3FF" />
      <path d="M9 47.5 L32 40.5 L55 47.5 L55 51 L32 44 L9 51 Z" fill="#7FB4F0" />
    </svg>
  );
}

export function Wordmark({ size = 32 }: { size?: number }) {
  return (
    <span className="wordmark">
      <LogoMark size={size} />
      <span className="wordmark-text">
        Exam<span>Peak</span>
      </span>
    </span>
  );
}
