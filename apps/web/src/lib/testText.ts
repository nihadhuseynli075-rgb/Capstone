import type { DifficultyMode, MockTest } from "@grade9/shared";
import { topicName } from "@grade9/shared";
import { fill } from "../features/friends/fill";
import { ApiError } from "../services/apiClient";
import { isTranslationKey, type TranslationKey } from "./i18n";

/**
 * The test pages' words for subjects, topics, difficulties, the paper's title
 * and things going wrong, in the student's language.
 *
 * Names are looked up by id rather than taken from the API or the shared
 * package, which only know them in English. Ids stay the same in every
 * language; names do not.
 */

type Translate = (key: TranslationKey) => string;
type TranslateCount = (key: TranslationKey, count: number, values?: Record<string, string | number>) => string;

/** A subject's name, or `fallback` (the API's name) for a subject with no translation. */
export function subjectLabel(t: Translate, subjectId: string, fallback?: string): string {
  const key = `subject.${subjectId}`;
  if (isTranslationKey(key)) return t(key);
  return fallback ?? subjectId.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * A topic's name.
 *
 * A topic an admin typed in has no translation, so it is shown by the name the
 * API gave it. Without that name to hand (on the exam screen, which has no
 * catalog), the shared package tidies the id up exactly the way the API does.
 */
export function topicLabel(t: Translate, subjectId: string, topicId: string, fallback?: string): string {
  const key = `topic.${topicId}`;
  if (isTranslationKey(key)) return t(key);
  return fallback ?? topicName(subjectId, topicId);
}

const DIFFICULTY_KEYS: Record<DifficultyMode, TranslationKey> = {
  easy: "difficulty.easy",
  medium: "difficulty.medium",
  hard: "difficulty.hard",
  custom: "difficulty.custom"
};

export function difficultyLabel(t: Translate, mode: string): string {
  const key = DIFFICULTY_KEYS[mode as DifficultyMode];
  return key ? t(key) : mode;
}

/**
 * The paper's title, built here in the site language from what the paper is.
 *
 * The API still sends a title, in English. It is only used for a paper saved
 * by an older build whose settings do not say which subject and topics it
 * covers, so a test started before this change still has a heading.
 */
export function paperTitle(test: MockTest, t: Translate, tn: TranslateCount): string {
  const { subjectId, topicIds } = test.settings as { subjectId?: unknown; topicIds?: unknown };

  if (
    typeof subjectId !== "string" ||
    !Array.isArray(topicIds) ||
    topicIds.length === 0 ||
    !topicIds.every((topicId) => typeof topicId === "string")
  ) {
    return test.title;
  }

  const topic =
    topicIds.length === 1 ? topicLabel(t, subjectId, topicIds[0]) : tn("count.topics", topicIds.length);

  return fill(t("exam.title"), { subject: subjectLabel(t, subjectId), topic });
}

/**
 * What to tell the student about a failed request.
 *
 * The API writes its messages in English, for a developer to read, so the
 * sentence is chosen by status and code instead. `conflict` is the sentence
 * for a 409, which means something different on each endpoint.
 */
export function testErrorText(cause: unknown, t: Translate, conflict?: TranslationKey): string {
  if (!(cause instanceof ApiError)) return t("profile.errGeneric");

  if (cause.code === "time-expired") return t("test.errTimeExpired");

  switch (cause.status) {
    case 0:
      return t("profile.errNetwork");
    case 400:
      return t("test.errInvalid");
    case 401:
      return t("profile.errSignInAgain");
    case 403:
      return t("test.errNotYours");
    case 404:
      return t("test.errNotFound");
    case 409:
      return t(conflict ?? "profile.errGeneric");
    default:
      return t("profile.errGeneric");
  }
}
