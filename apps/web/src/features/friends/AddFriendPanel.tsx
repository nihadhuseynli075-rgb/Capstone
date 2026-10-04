import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { SentFriendRequest } from "@grade9/shared";
import { useLanguage } from "../../lib/i18n";
import { Field, focusFirstError } from "../auth/AuthLayout";
import { fill } from "./fill";

/**
 * Asking somebody to be friends, by the email address or the username they
 * signed up with. Which of the two it is, the API works out.
 */
export function AddFriendPanel({
  onSend,
  explain,
  resetSignal
}: {
  onSend: (emailOrUsername: string) => Promise<SentFriendRequest>;
  explain: (cause: unknown) => string;
  /** Changes whenever something else is done on the page (see FriendsPage). */
  resetSignal: number;
}) {
  const { t } = useLanguage();
  const [typed, setTyped] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  // Once a request has been answered or a friend removed, "Request sent to
  // Aysel" or "You and Aysel are now friends" is old news, and could say the
  // opposite of what the page now shows.
  useEffect(() => {
    setSent(null);
  }, [resetSignal]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    setSent(null);

    if (typed.trim().length === 0) {
      setError(t("friends.error.invalidLookup"));
      focusFirstError("friend-lookup");
      return;
    }

    setError(null);
    setSending(true);

    try {
      const result = await onSend(typed);
      const message = result.outcome === "accepted" ? t("friends.nowFriends") : t("friends.sent");

      setSent(fill(message, { name: result.person.fullName }));
      setTyped("");
    } catch (cause) {
      setError(explain(cause));
      focusFirstError("friend-lookup");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="panel friends-panel">
      <h2>{t("friends.addTitle")}</h2>

      {sent && (
        <p className="success-banner" role="status">
          {sent}
        </p>
      )}

      <form className="friends-add-form" onSubmit={handleSubmit} noValidate>
        <Field
          id="friend-lookup"
          label={t("friends.addLabel")}
          type="text"
          // An email and a username are both lowercase, and a phone keyboard
          // that capitalises the first letter or "corrects" a username gets in
          // the way of both.
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="send"
          maxLength={254}
          placeholder={t("friends.addPlaceholder")}
          hint={t("friends.addHint")}
          value={typed}
          error={error}
          disabled={sending}
          onChange={(event) => {
            setTyped(event.target.value);
            setError(null);
          }}
        />

        <button type="submit" className="primary-button friends-add-submit" disabled={sending}>
          {sending ? t("friends.sending") : t("friends.send")}
        </button>
      </form>
    </section>
  );
}
