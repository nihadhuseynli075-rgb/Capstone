import { useEffect, useState } from "react";
import { normalizeUsername, usernameProblem, type UsernameProblem } from "@grade9/shared";
import { useLanguage } from "../../lib/i18n";
import * as profileApi from "../../services/profileApi";
import { fill, usernameProblemText } from "./profileText";

/** Long enough that a name being typed is not asked about on every key. */
const CHECK_DELAY_MS = 400;

/** What the form knows about the username in its box. */
export type UsernameState =
  /** Nothing typed. */
  | { kind: "idle" }
  /** It is the username the student already has. */
  | { kind: "current" }
  /** It breaks a rule, which the browser can tell without asking anyone. */
  | { kind: "problem"; problem: UsernameProblem }
  | { kind: "checking" }
  | { kind: "available"; username: string }
  | { kind: "taken" }
  /** The check itself failed. Saving is still allowed: the save decides. */
  | { kind: "unknown" };

/**
 * Works out what to say about a username while it is typed.
 *
 * The rules are checked on every key with the same function the API uses, so
 * those answers are immediate. Whether somebody already has the name needs the
 * API, so that is asked once typing pauses, and an answer that arrives after
 * the box has changed again is thrown away rather than shown for the wrong name.
 *
 * Only a hint. Two students can both be told a name is free, and the save is
 * what decides between them.
 */
export function useUsernameState(value: string, current: string): UsernameState {
  const normalized = normalizeUsername(value);
  const typed = value.trim().length > 0;
  const problem = typed ? usernameProblem(value) : null;
  const askable = typed && problem === null && normalized !== current;

  const [answer, setAnswer] = useState<{ username: string; state: UsernameState } | null>(null);

  useEffect(() => {
    if (!askable) return;

    let active = true;

    const timer = window.setTimeout(() => {
      profileApi
        .checkUsername(normalized)
        .then((result) => {
          if (!active) return;
          const state: UsernameState =
            result.reason === "taken"
              ? { kind: "taken" }
              : result.available
                ? { kind: "available", username: result.username }
                : { kind: "unknown" };
          setAnswer({ username: normalized, state });
        })
        .catch(() => {
          if (active) setAnswer({ username: normalized, state: { kind: "unknown" } });
        });
    }, CHECK_DELAY_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [askable, normalized]);

  if (!typed) return { kind: "idle" };
  if (problem) return { kind: "problem", problem };
  if (normalized === current) return { kind: "current" };
  return answer?.username === normalized ? answer.state : { kind: "checking" };
}

/**
 * The username box: an "@" in front, what to type, and a line saying whether
 * it will do.
 *
 * `serverError` is a refusal from the save itself (somebody took the name in
 * the meantime). It stands in for the hint until the box changes again.
 */
export function UsernameField({
  value,
  onChange,
  state,
  serverError,
  disabled
}: {
  value: string;
  onChange: (value: string) => void;
  state: UsernameState;
  serverError: string | null;
  disabled: boolean;
}) {
  const { t } = useLanguage();

  let tone: "ok" | "bad" | "wait" | null = null;
  let text: string | null = null;

  if (serverError) {
    tone = "bad";
    text = serverError;
  } else if (state.kind === "problem") {
    tone = "bad";
    text = usernameProblemText(state.problem, t);
  } else if (state.kind === "taken") {
    tone = "bad";
    text = t("profile.usernameTaken");
  } else if (state.kind === "available") {
    tone = "ok";
    text = fill(t("profile.usernameAvailable"), { username: state.username });
  } else if (state.kind === "checking") {
    tone = "wait";
    text = t("profile.usernameChecking");
  } else if (state.kind === "current") {
    tone = "wait";
    text = t("profile.usernameYours");
  } else if (state.kind === "unknown") {
    tone = "wait";
    text = t("profile.usernameCheckFailed");
  }

  const invalid = tone === "bad";

  return (
    <div className="auth-field">
      <label htmlFor="profile-username">{t("profile.username")}</label>

      <div className="username-input">
        <span className="username-at" aria-hidden="true">
          @
        </span>
        <input
          id="profile-username"
          type="text"
          className={invalid ? "has-error" : undefined}
          value={value}
          disabled={disabled}
          // The name is lowercase and has no accents, so none of the phone keyboard's help is wanted.
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid ? true : undefined}
          aria-describedby="profile-username-status profile-username-rules"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>

      <p
        id="profile-username-status"
        className={`username-status ${tone ?? ""}`}
        role={invalid ? "alert" : "status"}
      >
        {text}
      </p>
      <p className="auth-field-hint" id="profile-username-rules">
        {t("profile.usernameRules")}
      </p>
    </div>
  );
}
