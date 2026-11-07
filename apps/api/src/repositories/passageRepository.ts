import { randomUUID } from "node:crypto";
import type { ExamPassage, Passage, PassageDraft } from "@grade9/shared";
import { isUuid } from "../lib/ids";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { forgetPassage, readAllPages } from "./questionRepository";

/**
 * Reading passages (migration 0017): a text kept once, which any number of
 * questions point at. Like the questions, Supabase when it is configured and
 * memory when it is not.
 */

interface PassageRow {
  id: string;
  subject_id: string;
  title: string;
  body: string;
  paper_year: number | null;
  source: string | null;
  external_ref?: string | null;
  created_at: string;
  updated_at: string;
}

function toPassage(row: PassageRow): Passage {
  return {
    id: row.id,
    subjectId: row.subject_id,
    title: row.title,
    body: row.body,
    paperYear: row.paper_year,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toRow(draft: PassageDraft) {
  return {
    subject_id: draft.subjectId,
    title: draft.title,
    body: draft.body,
    paper_year: draft.paperYear,
    source: draft.source
  };
}

const memoryPassages = new Map<string, Passage>();
/** The memory store's external_ref column: ref to passage id. */
const memoryRefs = new Map<string, string>();

/**
 * Postgres's word for a table that is not there. A database that has not had
 * 0017 yet has no passages table, and reads there then mean "no passages"
 * rather than a failure, so tests can still be drawn before the migration.
 */
function isMissingTable(error: { code?: string; message: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /relation .*passages.* does not exist|could not find the table/i.test(error.message);
}

/** Passages by title, A to Z, optionally for one subject. */
export async function listPassages(filter: { subjectId?: string } = {}): Promise<Passage[]> {
  if (!supabaseAdmin) {
    return [...memoryPassages.values()]
      .filter((passage) => !filter.subjectId || passage.subjectId === filter.subjectId)
      .sort((a, b) => a.title.localeCompare(b.title) || (a.id < b.id ? -1 : 1));
  }

  const client = supabaseAdmin;

  try {
    const rows = await readAllPages((from, to) => {
      let query = client.from("passages").select("*", { count: "exact" }).order("title").order("id");
      if (filter.subjectId) query = query.eq("subject_id", filter.subjectId);
      return query.range(from, to);
    }, "list passages");
    return (rows as PassageRow[]).map(toPassage);
  } catch (error) {
    if (isMissingTable(error as Error)) return [];
    throw error;
  }
}

export async function getPassage(id: string): Promise<Passage | null> {
  if (!supabaseAdmin) return memoryPassages.get(id) ?? null;
  if (!isUuid(id)) return null;

  const { data, error } = await supabaseAdmin.from("passages").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(`Failed to load passage: ${error.message}`);
  }
  return data ? toPassage(data as PassageRow) : null;
}

/** The passages with these ids, as a student is given them, keyed by id. Unknown ids are left out. */
export async function examPassages(ids: readonly string[]): Promise<Map<string, ExamPassage>> {
  const wanted = [...new Set(ids)].filter((id) => supabaseAdmin === null || isUuid(id));
  const found = new Map<string, ExamPassage>();
  if (wanted.length === 0) return found;

  let passages: Passage[];

  if (!supabaseAdmin) {
    passages = wanted.flatMap((id) => {
      const passage = memoryPassages.get(id);
      return passage ? [passage] : [];
    });
  } else {
    const { data, error } = await supabaseAdmin.from("passages").select("*").in("id", wanted);
    if (error) {
      if (isMissingTable(error)) return found;
      throw new Error(`Failed to load passages: ${error.message}`);
    }
    passages = (data as PassageRow[]).map(toPassage);
  }

  for (const passage of passages) found.set(passage.id, { id: passage.id, title: passage.title, body: passage.body });
  return found;
}

export async function createPassage(draft: PassageDraft): Promise<Passage> {
  if (!supabaseAdmin) {
    const now = new Date().toISOString();
    const passage: Passage = { ...draft, id: randomUUID(), createdAt: now, updatedAt: now };
    memoryPassages.set(passage.id, passage);
    return passage;
  }

  const { data, error } = await supabaseAdmin.from("passages").insert(toRow(draft)).select("*").single();
  if (error) {
    if (isMissingTable(error)) throw new Error(MISSING_MIGRATION);
    throw new Error(`Failed to save passage: ${error.message}`);
  }
  return toPassage(data as PassageRow);
}

export async function updatePassage(id: string, draft: PassageDraft): Promise<Passage | null> {
  if (!supabaseAdmin) {
    const existing = memoryPassages.get(id);
    if (!existing) return null;
    const updated: Passage = { ...existing, ...draft, updatedAt: new Date().toISOString() };
    memoryPassages.set(id, updated);
    return updated;
  }

  if (!isUuid(id)) return null;

  const { data, error } = await supabaseAdmin.from("passages").update(toRow(draft)).eq("id", id).select("*").maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new Error(MISSING_MIGRATION);
    throw new Error(`Failed to update passage: ${error.message}`);
  }
  return data ? toPassage(data as PassageRow) : null;
}

/** Deletes a passage. Its questions stay in the bank, with no passage (the foreign key sets it null). */
export async function deletePassage(id: string): Promise<boolean> {
  if (!supabaseAdmin) {
    // The memory store has no foreign key to do this.
    forgetPassage(id);
    return memoryPassages.delete(id);
  }

  if (!isUuid(id)) return false;

  const { data, error } = await supabaseAdmin.from("passages").delete().eq("id", id).select("id");
  if (error) {
    if (isMissingTable(error)) return false;
    throw new Error(`Failed to delete passage: ${error.message}`);
  }
  return (data ?? []).length > 0;
}

const MISSING_MIGRATION =
  "Passages need the database update in supabase/migrations/0017_passages_and_multiple_answers.sql. Run it in the Supabase SQL editor, then try again.";

/**
 * Saves passages from a spreadsheet by their id in the sheet ("05-P1"): one
 * already in the bank under that ref is updated, the rest are added. Returns
 * every one of them by ref, for the import to link its questions to.
 */
export async function savePassagesByRef(
  items: Array<{ externalRef: string; draft: PassageDraft }>
): Promise<{ byRef: Map<string, Passage>; created: number; updated: number }> {
  const byRef = new Map<string, Passage>();
  let created = 0;
  let updated = 0;

  if (!supabaseAdmin) {
    for (const { externalRef, draft } of items) {
      const id = memoryRefs.get(externalRef);
      const saved = id ? await updatePassage(id, draft) : null;
      if (saved) {
        updated += 1;
        byRef.set(externalRef, saved);
      } else {
        const passage = await createPassage(draft);
        memoryRefs.set(externalRef, passage.id);
        created += 1;
        byRef.set(externalRef, passage);
      }
    }
    return { byRef, created, updated };
  }

  const existing = await passagesByRef(items.map((item) => item.externalRef));

  for (const { externalRef, draft } of items) {
    const found = existing.get(externalRef);
    if (found) {
      const saved = await updatePassage(found.id, draft);
      if (saved) {
        updated += 1;
        byRef.set(externalRef, saved);
        continue;
      }
    }
    const { data, error } = await supabaseAdmin
      .from("passages")
      .insert({ ...toRow(draft), external_ref: externalRef })
      .select("*")
      .single();
    if (error) {
      if (isMissingTable(error)) throw new Error(MISSING_MIGRATION);
      throw new Error(`Failed to save passage: ${error.message}`);
    }
    created += 1;
    byRef.set(externalRef, toPassage(data as PassageRow));
  }

  return { byRef, created, updated };
}

/** The passages already in the bank under these sheet ids, by ref. */
export async function passagesByRef(refs: readonly string[]): Promise<Map<string, Passage>> {
  const wanted = [...new Set(refs)].filter((ref) => ref.length > 0);
  const found = new Map<string, Passage>();
  if (wanted.length === 0) return found;

  if (!supabaseAdmin) {
    for (const ref of wanted) {
      const id = memoryRefs.get(ref);
      const passage = id ? memoryPassages.get(id) : undefined;
      if (passage) found.set(ref, passage);
    }
    return found;
  }

  const { data, error } = await supabaseAdmin.from("passages").select("*").in("external_ref", wanted);
  if (error) {
    if (isMissingTable(error)) throw new Error(MISSING_MIGRATION);
    throw new Error(`Failed to load passages: ${error.message}`);
  }
  for (const row of (data ?? []) as PassageRow[]) {
    if (row.external_ref) found.set(row.external_ref, toPassage(row));
  }
  return found;
}
