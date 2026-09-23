import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { GoogleMark, useLeavingForGoogle } from "../auth/GoogleButton";
import { useLanguage } from "../../lib/i18n";

/**
 * How this account can sign in, and connecting or disconnecting Google.
 *
 * Connecting leaves for Google the same way signing in does, and comes back
 * here. Disconnecting is only offered while there is another way in, and it
 * asks first: the app has no "forgot password" yet, so someone who has been
 * signing in with Google and has forgotten their password would be locked out.
 */
export function SignInMethodsPanel() {
  const { t } = useLanguage();
  const { user, linkGoogle, unlinkGoogle, redirectResult, clearRedirectResult } = useAuth();
  const [leaving, setLeaving] = useLeavingForGoogle();
  const [disconnecting, setDisconnecting] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Back from connecting Google: say how it went.
  useEffect(() => {
    if (redirectResult?.intent !== "link") return;

    setNotice(
      redirectResult.error
        ? { ok: false, text: redirectResult.error }
        : { ok: true, text: t("profile.googleConnected") }
    );
    clearRedirectResult();
  }, [redirectResult, clearRedirectResult, t]);

  if (!user) return null;

  const hasEmail = user.providers.includes("email");
  const hasGoogle = user.providers.includes("google");
  const canDisconnect = hasGoogle && user.providers.length > 1;

  async function handleConnect() {
    setNotice(null);
    setLeaving(true);

    try {
      await linkGoogle();
    } catch (cause) {
      setLeaving(false);
      setNotice({ ok: false, text: (cause as Error).message });
    }
  }

  async function handleDisconnect() {
    if (!window.confirm(t("profile.disconnectConfirm"))) return;

    setNotice(null);
    setDisconnecting(true);

    try {
      await unlinkGoogle();
      setNotice({ ok: true, text: t("profile.googleDisconnected") });
    } catch (cause) {
      setNotice({ ok: false, text: (cause as Error).message });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <section className="panel settings-panel">
      <h2>{t("profile.signInMethods")}</h2>
      <p className="panel-hint">{t("profile.methodsHint")}</p>

      {notice && (
        <p className={notice.ok ? "success-banner" : "error-banner"} role={notice.ok ? "status" : "alert"}>
          {notice.text}
        </p>
      )}

      <ul className="method-list">
        <li className="method">
          <svg className="method-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2.4V17h16V7.4l-8 5.6-8-5.6zM5.2 7 12 11.8 18.8 7H5.2z"
            />
          </svg>

          <div className="method-text">
            <strong>{t("profile.methodEmail")}</strong>
            <span>{hasEmail ? user.email : t("profile.methodEmailOff")}</span>
          </div>

          {hasEmail && <span className="method-status">{t("profile.connected")}</span>}
        </li>

        <li className="method">
          <span className="method-icon">
            <GoogleMark size={20} />
          </span>

          <div className="method-text">
            <strong>Google</strong>
            <span>{hasGoogle ? (user.googleEmail ?? user.email) : t("profile.methodGoogleOff")}</span>
          </div>

          {!hasGoogle && (
            <button type="button" className="ghost-button" onClick={handleConnect} disabled={leaving}>
              {leaving ? t("profile.openingGoogle") : t("profile.connectGoogle")}
            </button>
          )}

          {hasGoogle && !canDisconnect && <span className="method-status">{t("profile.connected")}</span>}

          {canDisconnect && (
            <button type="button" className="ghost-button" onClick={handleDisconnect} disabled={disconnecting}>
              {t("profile.disconnectGoogle")}
            </button>
          )}
        </li>
      </ul>
    </section>
  );
}
