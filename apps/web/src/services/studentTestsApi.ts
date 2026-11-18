import type {
  ExamQuestion,
  FriendPerson,
  StudentTest,
  StudentTestDraft,
  StudentTestSummary
} from "@grade9/shared";
import { accountToken } from "./accountToken";
import { apiRequest } from "./apiClient";

/**
 * Tests students make themselves: the owner's side and the friends' side, all
 * of which need a signed-in account, as the friends list does. Sitting a test
 * and reporting a question go through testsApi instead, since a guest can do
 * both (see startStudentTest and reportQuestion).
 */

export interface MyTests {
  tests: StudentTest[];
  /** The bank questions the tests pick, as a student sees them; null when the bank no longer has one. */
  picks: Record<string, ExamQuestion | null>;
}

export async function fetchMyTests(): Promise<MyTests> {
  return apiRequest<MyTests>("/api/student-tests/mine", { token: await accountToken() });
}

export async function fetchCommunityTests(): Promise<StudentTestSummary[]> {
  const { tests } = await apiRequest<{ tests: StudentTestSummary[] }>("/api/student-tests/community", {
    token: await accountToken()
  });
  return tests;
}

export interface PersonTests {
  person: FriendPerson;
  isMe: boolean;
  tests: StudentTestSummary[];
}

export async function fetchPersonTests(accountId: string): Promise<PersonTests> {
  return apiRequest<PersonTests>(`/api/student-tests/people/${encodeURIComponent(accountId)}`, {
    token: await accountToken()
  });
}

export async function fetchBankForPicking(
  subjectId: string,
  options: { topicId?: string; search?: string } = {}
): Promise<ExamQuestion[]> {
  const query = new URLSearchParams({ subject: subjectId });
  if (options.topicId) query.set("topic", options.topicId);
  if (options.search?.trim()) query.set("search", options.search.trim());
  const { questions } = await apiRequest<{ questions: ExamQuestion[] }>(`/api/student-tests/bank?${query}`, {
    token: await accountToken()
  });
  return questions;
}

/** Saves a new test, or the owner's changes to one (`id`). */
export async function saveStudentTest(id: string | null, draft: StudentTestDraft): Promise<StudentTest> {
  const { test } = await apiRequest<{ test: StudentTest }>(
    id ? `/api/student-tests/${encodeURIComponent(id)}` : "/api/student-tests",
    { method: id ? "PUT" : "POST", body: draft, token: await accountToken() }
  );
  return test;
}

export async function deleteStudentTest(id: string): Promise<void> {
  await apiRequest<{ done: true }>(`/api/student-tests/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token: await accountToken()
  });
}

/** Uploads a picture for one of the student's own questions, and gives back its link. */
export async function uploadTestPicture(file: File): Promise<string> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("The picture could not be read."));
    reader.readAsDataURL(file);
  });
  const { imageUrl } = await apiRequest<{ imageUrl: string }>("/api/student-tests/image", {
    method: "POST",
    body: { fileName: file.name, contentType: file.type || "image/png", dataBase64 },
    token: await accountToken()
  });
  return imageUrl;
}
