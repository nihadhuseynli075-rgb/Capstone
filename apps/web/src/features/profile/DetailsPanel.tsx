import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { normalizeUsername, usernameProblem } from "@grade9/shared";
import { useLanguage } from "../../lib/i18n";
import { ApiError } from "../../services/apiClient";
import { Field } from "../auth/AuthLayout";
import { nameProblem } from "../auth/authValidation";
import { errorText, nameProblemText, usernameProblemText } from "./profileText";
import { useProfile } from "./ProfileContext";
import { UsernameField, useUsernameState } from "./UsernameField";

/**
 * The name and the username, saved together.
 *
 * Only what was changed is sent, and the API writes both in one go: a username
 * somebody else has leaves the name unchanged too, rather than half saving.
 */
export function DetailsPanel({
  currentName,
  currentUsername,
  editable
}: {
  currentName: string;
  currentUsername: string;
  editable: boolean;
}) {
  const { t } = useLanguage();
  const { updateDetails } = useProfile();

  const [name, setName] = useState(currentName);
  const [username, setUsername] = useState(currentUsername);
  const [nameError, setNameError] = useState<string | null>(null);
  // A refusal of the username that the hint under the box could not know about:
  // the save came back taken, or the box was empty when Save was pressed.
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Either can change in another tab, or arrive after the page opens. After a
  // save, the username box also settles on the form it was stored in.
  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  useEffect(() => {
    setUsername(currentUsername);
  }, [currentUsername]);

  const nameChanged = name.trim().replace(/\s+/g, " ") !== currentName;
  const usernameChanged = normalizeUsername(username) !== currentUsername;
  const state = useUsernameState(username, currentUsername);

  // A name the hint already says cannot be used is not worth a trip to find out again.
  const blocked = usernameChanged && (state.kind === "problem" || state.kind === "taken");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(null);
    setFormError(null);

    const nameIssue = nameChanged ? nameProblem(name) : null;
    const usernameIssue = usernameChanged ? usernameProblem(username) : null;

    setNameError(nameIssue ? nameProblemText(nameIssue, t) : null);
    setUsernameError(usernameIssue ? usernameProblemText(usernameIssue, t) : null);
    if (nameIssue || usernameIssue) return;

    const changes: { fullName?: string; username?: string } = {};
    if (nameChanged) changes.fullName = name;
    if (usernameChanged) changes.username = username;

    setSaving(true);
    try {
      await updateDetails(changes);
      setSaved(
        t(nameChanged && usernameChanged ? "profile.detailsSaved" : nameChanged ? "profile.nameSaved" : "profile.usernameSaved")
      );
    } catch (cause) {
      const text = errorText(cause, t);

      if (cause instanceof ApiError && cause.code?.startsWith("username-")) setUsernameError(text);
      else if (cause instanceof ApiError && cause.code === "name-invalid") setNameError(text);
      else setFormError(text);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel settings-panel">
      <h2>{t("profile.details")}</h2>

      <form className="settings-form" onSubmit={handleSubmit} noValidate>
        {saved && (
          <p className="success-banner" role="status">
            {saved}
          </p>
        )}
        {formError && (
          <p className="error-banner" role="alert">
            {formError}
          </p>
        )}

        <Field
          id="profile-name"
          label={t("profile.name")}
          type="text"
          autoComplete="name"
          value={name}
          error={nameError}
          disabled={saving || !editable}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(null);
            setSaved(null);
          }}
        />

        <UsernameField
          value={username}
          state={state}
          serverError={usernameError}
          disabled={saving || !editable}
          onChange={(value) => {
            setUsername(value);
            setUsernameError(null);
            setSaved(null);
          }}
        />

        <div className="settings-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={saving || !editable || (!nameChanged && !usernameChanged) || blocked}
          >
            {saving ? t("common.saving") : t("profile.saveDetails")}
          </button>
        </div>
      </form>
    </section>
  );
}
