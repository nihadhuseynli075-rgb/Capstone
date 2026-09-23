import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

/** Google's "G" in its four colours, which Google's sign-in guidelines ask for. */
export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/**
 * Whether this page is on its way to Google.
 *
 * A button that sends the browser off stays busy, since the page is about to
 * go. But pressing Back on Google's screen can bring the page back from the
 * browser's cache exactly as it was left, busy button and all, so the busy
 * state is dropped when that happens.
 */
export function useLeavingForGoogle(): [boolean, (leaving: boolean) => void] {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setLeaving(false);
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return [leaving, setLeaving];
}

/**
 * "Continue with Google", for the sign-in and sign-up pages.
 *
 * One button for both: Google makes the account the first time and signs in
 * every time after, and the trip ends on the profile page either way.
 */
export function GoogleButton({
  disabled,
  onError
}: {
  disabled?: boolean;
  onError: (message: string | null) => void;
}) {
  const { signInWithGoogle } = useAuth();
  const [leaving, setLeaving] = useLeavingForGoogle();

  async function handleClick() {
    onError(null);
    setLeaving(true);

    try {
      await signInWithGoogle();
    } catch (cause) {
      setLeaving(false);
      onError((cause as Error).message);
    }
  }

  return (
    <button type="button" className="google-button" onClick={handleClick} disabled={disabled || leaving}>
      <GoogleMark />
      <span>{leaving ? "Opening Google..." : "Continue with Google"}</span>
    </button>
  );
}
