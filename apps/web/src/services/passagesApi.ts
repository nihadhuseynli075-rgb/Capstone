import type { Passage, PassageDraft } from "@grade9/shared";
import { getAdminToken } from "./adminApi";
import { apiRequest } from "./apiClient";

/** The admin dashboard's reading passages (migration 0017). */

export function fetchPassages(): Promise<{ passages: Passage[]; questionCounts: Record<string, number> }> {
  return apiRequest("/api/admin/passages", { token: getAdminToken() ?? undefined });
}

export function createPassage(draft: PassageDraft): Promise<{ passage: Passage }> {
  return apiRequest("/api/admin/passages", { method: "POST", body: draft, token: getAdminToken() ?? undefined });
}

export function updatePassage(id: string, draft: PassageDraft): Promise<{ passage: Passage }> {
  return apiRequest(`/api/admin/passages/${id}`, { method: "PUT", body: draft, token: getAdminToken() ?? undefined });
}

export function deletePassage(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/admin/passages/${id}`, { method: "DELETE", token: getAdminToken() ?? undefined });
}
