import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useLanguage, type TranslationKey } from "../../lib/i18n";
import { Avatar } from "./Avatar";
import { preparePhoto, PhotoError, type PhotoProblem } from "./preparePhoto";
import { useProfile } from "./ProfileContext";

const PROBLEM_TEXT: Record<PhotoProblem, TranslationKey> = {
  "not-image": "profile.photoNotImage",
  "too-large": "profile.photoTooLarge",
  unreadable: "profile.photoUnreadable"
};

type Busy = "preparing" | "saving" | "removing" | null;

/**
 * The top of the profile: the photo, the name and the email, with the photo's
 * buttons underneath.
 *
 * A chosen photo is shown in place first, cropped the way it will be stored,
 * and only uploaded once it is saved. Picking the wrong file, or one that
 * crops badly, costs nothing.
 */
export function PhotoPanel({
  name,
  email,
  memberSince,
  editable
}: {
  name: string;
  email: string;
  memberSince: string | null;
  editable: boolean;
}) {
  const { t } = useLanguage();
  const { profile, uploadPhoto, removePhoto } = useProfile();
  const input = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<{ photo: Blob; address: string } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const photoUrl = profile?.avatarUrl ?? null;

  // A preview is held at an address the browser made for it, which is given
  // back once it is replaced, saved or abandoned.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.address);
  }, [preview]);

  // Signing in as somebody else, in this tab or another, must not leave a
  // photo picked for the previous account sitting there ready to be saved
  // onto this one.
  useEffect(() => {
    setPreview(null);
  }, [profile?.id]);

  async function handleChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so that choosing the same file again still counts as a choice.
    event.target.value = "";
    if (!file) return;

    setNotice(null);
    setBusy("preparing");

    try {
      const photo = await preparePhoto(file);
      setPreview({ photo, address: URL.createObjectURL(photo) });
    } catch (cause) {
      const problem = cause instanceof PhotoError ? cause.problem : "unreadable";
      setNotice({ ok: false, text: t(PROBLEM_TEXT[problem]) });
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    if (!preview) return;

    setNotice(null);
    setBusy("saving");

    try {
      await uploadPhoto(preview.photo);
      setPreview(null);
      setNotice({ ok: true, text: t("profile.photoSaved") });
    } catch (cause) {
      setNotice({ ok: false, text: (cause as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    setNotice(null);
    setBusy("removing");

    try {
      await removePhoto();
      setNotice({ ok: true, text: t("profile.photoRemoved") });
    } catch (cause) {
      setNotice({ ok: false, text: (cause as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel profile-card">
      <div className="profile-identity">
        <Avatar name={name} photoUrl={preview?.address ?? photoUrl} size={88} alt={t("profile.photo")} />

        <div className="profile-identity-text">
          <h2>{name}</h2>
          <p>{email}</p>
          {memberSince && (
            <p className="profile-since">
              {t("profile.memberSince")} {memberSince}
            </p>
          )}
        </div>
      </div>

      {notice && (
        <p className={notice.ok ? "success-banner" : "error-banner"} role={notice.ok ? "status" : "alert"}>
          {notice.text}
        </p>
      )}

      {preview && <p className="panel-hint">{t("profile.previewHint")}</p>}

      <input ref={input} type="file" accept="image/*" hidden onChange={handleChosen} />

      <div className="settings-actions">
        {preview ? (
          <>
            <button
              type="button"
              className="primary-button"
              onClick={handleSave}
              disabled={!editable || busy !== null}
            >
              {busy === "saving" ? t("common.saving") : t("profile.savePhoto")}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setPreview(null)}
              disabled={busy !== null}
            >
              {t("profile.cancel")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="ghost-button"
              onClick={() => input.current?.click()}
              disabled={!editable || busy !== null}
            >
              {busy === "preparing"
                ? t("profile.preparing")
                : photoUrl
                  ? t("profile.changePhoto")
                  : t("profile.uploadPhoto")}
            </button>

            {photoUrl && (
              <button
                type="button"
                className="danger-button"
                onClick={handleRemove}
                disabled={!editable || busy !== null}
              >
                {busy === "removing" ? t("profile.removing") : t("profile.removePhoto")}
              </button>
            )}
          </>
        )}
      </div>

      <p className="auth-field-hint">{t("profile.photoHint")}</p>
    </section>
  );
}
