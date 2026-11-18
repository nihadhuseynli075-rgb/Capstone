import type { TranslationKey } from "../../lib/i18n";
import { testErrorText } from "../../lib/testText";
import { ApiError } from "../../services/apiClient";

type Translate = (key: TranslationKey) => string;

/**
 * A failure from the student-made tests or from reporting a question, in the
 * site language. The API's codes for what only these routes refuse are
 * worded here; everything else is worded as any test's failure is.
 */
export function studentTestErrorText(cause: unknown, t: Translate): string {
  if (cause instanceof ApiError) {
    switch (cause.code) {
      case "gone":
      case "not-friends":
        return t("mytests.error.gone");
      case "no-questions":
        return t("mytests.error.noQuestions");
      case "too-many-tests":
        // Starting too many sittings shares the code with keeping too many tests.
        return cause.status === 429 ? t("test.errTooMany") : t("mytests.error.tooMany");
      case "too-many-pictures":
        return t("mytests.error.tooManyPictures");
      case "student-tests-unavailable":
        return t("mytests.unavailable");
      case "already-reported":
        return t("report.already");
      case "too-many-reports":
        return t("report.error.tooMany");
      default:
        break;
    }
    // The API words what is wrong with a test it refused ("Question 3: mark
    // which option is the right one."). The builder checks the same things
    // first, in the site language, so this is only reached by what it cannot
    // know, and saying what it is beats a general "not valid".
    if (cause.status === 400 && cause.message) return cause.message;
  }
  return testErrorText(cause, t);
}
