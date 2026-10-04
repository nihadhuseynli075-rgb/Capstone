import type { QuestionDraft, QuestionStatus } from "@grade9/shared";

/**
 * Where a question stands after the admin form saves it.
 *
 * The form only saves a question once its options and answer are filled in,
 * so saving finishes a draft. A question waiting for its diagram is different:
 * the form cannot tell whether a picture is still to come, and does not ask
 * for one. Typing the answer in and saving used to mark it ready regardless,
 * and the question went out to students without the diagram it is about. It
 * now waits until a picture is attached, which is what its label promises.
 *
 * A new question has no status yet and is ready: anything the form or a sheet
 * is happy with can be served.
 */
export function statusAfterSave(current: QuestionStatus | null, draft: Pick<QuestionDraft, "imageUrl">): QuestionStatus {
  const hasPicture = typeof draft.imageUrl === "string" && draft.imageUrl.trim().length > 0;
  if (current === "image-pending" && !hasPicture) return "image-pending";
  return "ready";
}
