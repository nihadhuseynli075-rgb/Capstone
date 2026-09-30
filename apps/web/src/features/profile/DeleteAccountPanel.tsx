import { useState } from "react";
import type { FormEvent } from "react";
import { Field } from "../auth/AuthLayout";
import { useLanguage } from "../../lib/i18n";
import { useProfile } from "./ProfileContext";

/**
 * Deleting the account, for good.
 *
 * Two deliberate steps: open the form, then type the account's email back.
 * Typing it is what makes this impossible to do by accident, and the API
 * checks the same thing again before it deletes anything.
 */
export function DeleteAccountPanel({
  email,
  editable,
  onDeleted
}: {
  email: string;
  editable: boolean;
  onDeleted: () => void;
}) {
  const { t } = useLanguage();
  const { deleteAccount } = useProfile();

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  function close() {
    setOpen(false);
    setTyped("");
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!matches) {
      setError(t("profile.deleteMismatch"));
      return;
    }

    setError(null);
    setDeleting(true);

    try {
      await deleteAccount(typed);
      onDeleted();
    } catch (cause) {
      setError((cause as Error).message);
      setDeleting(false);
    }
  }

  return (
    <section className="panel settings-panel danger-panel">
      <h2>{t("profile.deleteTitle")}</h2>
      <p className="panel-hint">{t("profile.deleteBody")}</p>

      {!open ? (
        <div className="settings-actions">
          <button type="button" className="danger-button" onClick={() => setOpen(true)} disabled={!editable}>
            {t("profile.deleteStart")}
          </button>
        </div>
      ) : (
        <form className="settings-form" onSubmit={handleSubmit} noValidate>
          <Field
            id="delete-confirm"
            label={t("profile.deleteConfirmLabel")}
            type="email"
            autoComplete="off"
            inputMode="email"
            placeholder={email}
            value={typed}
            error={error}
            disabled={deleting}
            autoFocus
            onChange={(event) => {
              setTyped(event.target.value);
              setError(null);
            }}
          />

          <div className="settings-actions">
            <button type="submit" className="danger-button danger-solid" disabled={deleting || !matches}>
              {deleting ? t("profile.deleting") : t("profile.deleteConfirm")}
            </button>
            <button type="button" className="ghost-button" onClick={close} disabled={deleting}>
              {t("profile.cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
