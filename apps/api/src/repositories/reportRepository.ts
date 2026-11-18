import { randomUUID } from "node:crypto";
import type { ReportReason, ReportStatus } from "@grade9/shared";
import { isUuid } from "../lib/ids";
import { PublicError } from "../lib/publicError";
import { supabaseAdmin } from "../lib/supabaseAdmin";

/**
 * Questions students reported as wrong, impossible or unclear, kept in
 * `question_reports` (migration 0020) and listed on the admin dashboard.
 *
 * Unlike student-made tests, reports work without Supabase too: a guest can
 * report a bank question from any test, and the admin dashboard runs in memory
 * mode. Both branches behave the same, down to refusing a second report of
 * the same question of the same attempt.
 */

export interface StoredReport {
  id: string;
  reporterKey: string;
  reporterId: string | null;
  attemptId: string | null;
  position: number;
  questionId: string | null;
  studentTestId: string | null;
  subjectId: string;
  prompt: string;
  options: string[];
  correctAnswer: string;
  imageUrl: string | null;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  createdAt: string;
  closedAt: string | null;
}

export type NewReport = Omit<StoredReport, "id" | "status" | "createdAt" | "closedAt">;

const memoryReports = new Map<string, StoredReport>();

function reportsError(action: string, error: { code?: string; message: string }): Error {
  const missing = ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "");
  const hint = missing
    ? " Part of the database is missing: run supabase/run-all.sql (or migration 0020) in the Supabase SQL editor."
    : "";
  return new PublicError(`Failed to ${action}.${hint}`, error.message);
}

function fromRow(row: Record<string, unknown>): StoredReport {
  return {
    id: row.id as string,
    reporterKey: row.reporter_key as string,
    reporterId: (row.reporter_id ?? null) as string | null,
    attemptId: (row.attempt_id ?? null) as string | null,
    position: row.position as number,
    questionId: (row.question_id ?? null) as string | null,
    studentTestId: (row.student_test_id ?? null) as string | null,
    subjectId: row.subject_id as string,
    prompt: row.prompt as string,
    options: Array.isArray(row.options) ? (row.options as string[]) : [],
    correctAnswer: (row.correct_answer ?? "") as string,
    imageUrl: (row.image_url ?? null) as string | null,
    reason: row.reason as ReportReason,
    details: (row.details ?? "") as string,
    status: row.status as ReportStatus,
    createdAt: row.created_at as string,
    closedAt: (row.closed_at ?? null) as string | null
  };
}

/** The report, or "already-reported" when this question of this attempt has been reported before. */
export async function createReport(input: NewReport): Promise<StoredReport | "already-reported"> {
  if (!supabaseAdmin) {
    for (const report of memoryReports.values()) {
      if (report.attemptId === input.attemptId && report.position === input.position) return "already-reported";
    }
    const report: StoredReport = {
      ...input,
      id: randomUUID(),
      status: "open",
      createdAt: new Date().toISOString(),
      closedAt: null
    };
    memoryReports.set(report.id, report);
    return report;
  }

  const { data, error } = await supabaseAdmin
    .from("question_reports")
    .insert({
      reporter_key: input.reporterKey,
      reporter_id: input.reporterId,
      attempt_id: input.attemptId,
      position: input.position,
      question_id: input.questionId,
      student_test_id: input.studentTestId,
      subject_id: input.subjectId,
      prompt: input.prompt,
      options: input.options,
      correct_answer: input.correctAnswer,
      image_url: input.imageUrl,
      reason: input.reason,
      details: input.details
    })
    .select("*")
    .single();

  // The unique index on (attempt_id, position): two reports sent together, or
  // a second tab, land here rather than adding a copy.
  if (error?.code === "23505") return "already-reported";
  if (error) throw reportsError("save the report", error);
  return fromRow(data);
}

/** Positions of this attempt's questions that have been reported, so the results page can say so. */
export async function reportedPositions(attemptId: string): Promise<number[]> {
  if (!supabaseAdmin) {
    return [...memoryReports.values()].filter((report) => report.attemptId === attemptId).map((report) => report.position);
  }
  if (!isUuid(attemptId)) return [];
  const { data, error } = await supabaseAdmin.from("question_reports").select("position").eq("attempt_id", attemptId);
  if (error) throw reportsError("load your reports", error);
  return (data ?? []).map((row) => row.position as number);
}

/** Reports in one state (or all), newest first. */
export async function listReports(status: ReportStatus | "all"): Promise<StoredReport[]> {
  if (!supabaseAdmin) {
    return [...memoryReports.values()]
      .filter((report) => status === "all" || report.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  let query = supabaseAdmin.from("question_reports").select("*");
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
  if (error) throw reportsError("load the reported questions", error);
  return (data ?? []).map(fromRow);
}

export async function getReport(id: string): Promise<StoredReport | null> {
  if (!supabaseAdmin) return memoryReports.get(id) ?? null;
  if (!isUuid(id)) return null;
  const { data, error } = await supabaseAdmin.from("question_reports").select("*").eq("id", id).maybeSingle();
  if (error) throw reportsError("load the report", error);
  return data ? fromRow(data) : null;
}

/** Null when there is no such report. Closing stamps the time; reopening clears it. */
export async function setReportStatus(id: string, status: ReportStatus): Promise<StoredReport | null> {
  const closedAt = status === "open" ? null : new Date().toISOString();

  if (!supabaseAdmin) {
    const report = memoryReports.get(id);
    if (!report) return null;
    const updated = { ...report, status, closedAt };
    memoryReports.set(id, updated);
    return updated;
  }

  if (!isUuid(id)) return null;
  const { data, error } = await supabaseAdmin
    .from("question_reports")
    .update({ status, closed_at: closedAt })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw reportsError("update the report", error);
  return data ? fromRow(data) : null;
}
