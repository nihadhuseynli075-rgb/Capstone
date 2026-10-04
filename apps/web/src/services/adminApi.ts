import type { BankQuestion, QuestionDraft } from "@grade9/shared";
import { apiRequest } from "./apiClient";

const TOKEN_KEY = "examPeak.adminToken";

export function getAdminToken(): string | null {
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  if (token) {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  } else {
    window.sessionStorage.removeItem(TOKEN_KEY);
  }
}

export interface LoginResponse {
  token: string;
  storageMode: "supabase" | "memory";
  usingDefaultPassword: boolean;
}

export function adminLogin(password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/api/admin/login", { method: "POST", body: { password } });
}

/**
 * Ends the session on the API, not only in this tab.
 *
 * Forgetting the token here was all signing out did, and the API went on
 * honouring it for the rest of its twelve hours: anyone who had copied it
 * (from a shared computer's storage, say) could still use the dashboard.
 */
export async function adminLogout(): Promise<void> {
  const token = getAdminToken();
  if (!token) return;
  await apiRequest("/api/admin/logout", { method: "POST", token });
}

export async function fetchQuestions(filters: {
  subject?: string;
  difficulty?: string;
  search?: string;
}): Promise<{
  questions: BankQuestion[];
  /** The whole bank, whatever the filters. Optional so an older API still reads. */
  bank?: { total: number; written: number };
  storageMode: "supabase" | "memory";
  usingDefaultPassword: boolean;
  /** Whether the AI marker is set up. Optional so an older API still reads. */
  writtenMarking?: boolean;
}> {
  const params = new URLSearchParams();
  if (filters.subject) params.set("subject", filters.subject);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  if (filters.search) params.set("search", filters.search);

  const query = params.toString();

  return apiRequest(`/api/admin/questions${query ? `?${query}` : ""}`, {
    token: getAdminToken() ?? undefined
  });
}

export function createQuestion(draft: QuestionDraft): Promise<{ question: BankQuestion }> {
  return apiRequest("/api/admin/questions", {
    method: "POST",
    body: draft,
    token: getAdminToken() ?? undefined
  });
}

export function updateQuestion(id: string, draft: QuestionDraft): Promise<{ question: BankQuestion }> {
  return apiRequest(`/api/admin/questions/${id}`, {
    method: "PUT",
    body: draft,
    token: getAdminToken() ?? undefined
  });
}

export function deleteQuestion(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/admin/questions/${id}`, {
    method: "DELETE",
    token: getAdminToken() ?? undefined
  });
}

export interface ImportResponse {
  importedCount: number;
  skippedCount: number;
  errors: Array<{ row: number; message: string }>;
  questions: BankQuestion[];
}

export function importQuestions(csv: string): Promise<ImportResponse> {
  return apiRequest("/api/admin/questions/import", {
    method: "POST",
    body: { csv },
    token: getAdminToken() ?? undefined
  });
}

/** Reads a picked file as base64 for the upload endpoint. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // Strip the "data:image/png;base64," prefix; the API wants raw base64.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export async function uploadQuestionImage(file: File): Promise<string> {
  const dataBase64 = await fileToBase64(file);

  const data = await apiRequest<{ imageUrl: string }>("/api/admin/questions/image", {
    method: "POST",
    body: { fileName: file.name, contentType: file.type, dataBase64 },
    token: getAdminToken() ?? undefined
  });

  return data.imageUrl;
}
