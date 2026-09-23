/**
 * A local stand-in for the two Supabase services this app talks to.
 *
 *   node scripts/supabase-standin.mjs            (listens on 54399)
 *
 * It answers the PostgREST calls the API makes (/rest/v1) against the four
 * tables in supabase/migrations that the API reads and writes, and the GoTrue
 * calls both the API and the browser make (/auth/v1) for email and password
 * accounts. It holds everything in memory and needs nothing installed.
 *
 * It exists because the Supabase code paths otherwise only run against a real
 * project, and there is not always one to hand. So it imitates the Postgres
 * behaviour those paths depend on: uuid and integer column types, NOT NULL,
 * CHECK and foreign key constraints, cascades, one statement being all or
 * nothing, and Supabase refusing an UPDATE or DELETE with no filter.
 *
 * It is not Supabase. Passing against it means the API sends requests of the
 * right shape and copes with the answers and failures it gets back. It says
 * nothing about row level security, whether the migration SQL runs, or real
 * network behaviour. Check those against a real, disposable project.
 *
 * Tests steer it through /__standin: create accounts, expire their sessions,
 * inject failures and latency, and read or edit rows directly.
 */

import http from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;

/** Supabase's default "Max rows" setting: longer reads are cut off here. */
const MAX_ROWS = 1000;

class PgError extends Error {
  constructor(status, code, message, details = null, hint = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.hint = hint;
  }
}

const nowIso = () => new Date().toISOString();

function column(type, options = {}) {
  return { type, notNull: false, default: undefined, ...options };
}

const oneOf = (values) => (value) => values.includes(value);

/** The tables the API touches, as the migrations leave them after 0001-0005. */
const SCHEMA = {
  profiles: {
    columns: {
      id: column("uuid", { notNull: true }),
      full_name: column("text"),
      email: column("text"),
      grade_level: column("int", { notNull: true, default: () => 9 }),
      created_at: column("timestamptz", { notNull: true, default: nowIso })
    },
    checks: []
  },
  questions: {
    columns: {
      id: column("uuid", { notNull: true, default: () => randomUUID() }),
      subject_id: column("text", { notNull: true }),
      topic_id: column("text", { notNull: true }),
      difficulty: column("text", { notNull: true }),
      type: column("text", { notNull: true }),
      prompt: column("text", { notNull: true }),
      options: column("jsonb", { notNull: true, default: () => [] }),
      correct_answer: column("text", { notNull: true }),
      explanation: column("text", { notNull: true, default: () => "" }),
      image_url: column("text"),
      paper_year: column("int"),
      source: column("text"),
      created_at: column("timestamptz", { notNull: true, default: nowIso }),
      updated_at: column("timestamptz", { notNull: true, default: nowIso }),
      marks: column("int", { notNull: true, default: () => 1 })
    },
    checks: [
      ["questions_difficulty_check", (row) => oneOf(["easy", "medium", "hard"])(row.difficulty)],
      ["questions_type_check", (row) => oneOf(["multiple-choice", "short-answer"])(row.type)],
      ["questions_marks_positive", (row) => row.marks > 0]
    ],
    // The set_updated_at trigger from 0001.
    beforeUpdate: (row) => ({ ...row, updated_at: nowIso() })
  },
  test_attempts: {
    columns: {
      id: column("uuid", { notNull: true, default: () => randomUUID() }),
      student_id: column("uuid"),
      student_key: column("text", { notNull: true }),
      subject_id: column("text", { notNull: true }),
      topic_ids: column("text[]", { notNull: true, default: () => [] }),
      difficulty_mode: column("text", { notNull: true }),
      question_count: column("int", { notNull: true }),
      time_limit_minutes: column("int"),
      score: column("int"),
      total_questions: column("int"),
      percentage: column("numeric"),
      time_taken_seconds: column("int"),
      created_at: column("timestamptz", { notNull: true, default: nowIso }),
      submitted_at: column("timestamptz"),
      total_marks: column("int")
    },
    checks: [
      [
        "test_attempts_difficulty_mode_check",
        (row) => oneOf(["easy", "medium", "hard", "custom"])(row.difficulty_mode)
      ]
    ]
  },
  attempt_questions: {
    columns: {
      id: column("uuid", { notNull: true, default: () => randomUUID() }),
      attempt_id: column("uuid", { notNull: true }),
      question_id: column("uuid"),
      position: column("int", { notNull: true }),
      subject_id: column("text", { notNull: true }),
      topic_id: column("text", { notNull: true }),
      difficulty: column("text", { notNull: true }),
      type: column("text", { notNull: true }),
      prompt: column("text", { notNull: true }),
      options: column("jsonb", { notNull: true, default: () => [] }),
      correct_answer: column("text", { notNull: true }),
      explanation: column("text", { notNull: true, default: () => "" }),
      image_url: column("text"),
      student_answer: column("text"),
      is_correct: column("bool"),
      created_at: column("timestamptz", { notNull: true, default: nowIso }),
      marks: column("int", { notNull: true, default: () => 1 }),
      score: column("int")
    },
    checks: [
      [
        "attempt_questions_score_within_marks",
        (row) => row.score === null || (row.score >= 0 && row.score <= row.marks)
      ]
    ]
  }
};

const FOREIGN_KEYS = [
  { table: "test_attempts", column: "student_id", references: "profiles", onDelete: "cascade" },
  { table: "attempt_questions", column: "attempt_id", references: "test_attempts", onDelete: "cascade" },
  { table: "attempt_questions", column: "question_id", references: "questions", onDelete: "set null" }
];

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

function columnSpec(table, name) {
  const spec = SCHEMA[table].columns[name];
  if (!spec) {
    throw new PgError(400, "PGRST204", `Could not find the '${name}' column of '${table}' in the schema cache`);
  }
  return spec;
}

/** Converts a JSON value or a filter string into what Postgres would store. */
function toStored(spec, value) {
  if (value === null || value === undefined) return null;

  switch (spec.type) {
    case "uuid":
      if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
        throw new PgError(400, "22P02", `invalid input syntax for type uuid: "${value}"`);
      }
      return value.toLowerCase();
    case "int": {
      const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof number !== "number" || !Number.isInteger(number)) {
        throw new PgError(400, "22P02", `invalid input syntax for type integer: "${value}"`);
      }
      if (number < INT4_MIN || number > INT4_MAX) {
        throw new PgError(400, "22003", `value "${value}" is out of range for type integer`);
      }
      return number;
    }
    case "numeric": {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        throw new PgError(400, "22P02", `invalid input syntax for type numeric: "${value}"`);
      }
      return number;
    }
    case "bool":
      if (value === true || value === "true") return true;
      if (value === false || value === "false") return false;
      throw new PgError(400, "22P02", `invalid input syntax for type boolean: "${value}"`);
    case "text":
      return typeof value === "object" ? JSON.stringify(value) : String(value);
    case "text[]":
      if (!Array.isArray(value)) {
        throw new PgError(400, "22P02", `malformed array literal: "${JSON.stringify(value)}"`);
      }
      return value.map((item) => String(item));
    case "jsonb":
      return structuredClone(value);
    case "timestamptz": {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new PgError(400, "22007", `invalid input syntax for type timestamp with time zone: "${value}"`);
      }
      return date.toISOString();
    }
    default:
      throw new Error(`unknown column type ${spec.type}`);
  }
}

/** How PostgREST writes a stored value back out as JSON. */
function toJson(spec, value) {
  if (value === null || value === undefined) return null;
  if (spec.type === "timestamptz") return value.replace("Z", "+00:00");
  if (spec.type === "jsonb" || spec.type === "text[]") return structuredClone(value);
  return value;
}

function compareValues(spec, left, right) {
  if (spec.type === "timestamptz") return new Date(left).getTime() - new Date(right).getTime();
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean") return Number(left) - Number(right);
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Query strings
// ---------------------------------------------------------------------------

const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "columns", "on_conflict"]);

/** Splits on commas that are not inside parentheses or double quotes. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let quoted = false;
  let current = "";

  for (const char of text) {
    if (char === '"') quoted = !quoted;
    if (!quoted && char === "(") depth += 1;
    if (!quoted && char === ")") depth -= 1;
    if (!quoted && depth === 0 && char === ",") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  if (current.length > 0) parts.push(current);
  return parts;
}

function likePattern(pattern, caseInsensitive) {
  const source = pattern
    .split("")
    .map((char) => {
      if (char === "%" || char === "*") return ".*";
      if (char === "_") return ".";
      return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${source}$`, caseInsensitive ? "is" : "s");
}

function buildFilter(table, name, expression) {
  const spec = columnSpec(table, name);
  let negate = false;
  let rest = expression;

  if (rest.startsWith("not.")) {
    negate = true;
    rest = rest.slice(4);
  }

  const dot = rest.indexOf(".");
  if (dot === -1) throw new PgError(400, "PGRST100", `failed to parse filter (${expression})`);
  const operator = rest.slice(0, dot);
  const raw = rest.slice(dot + 1);

  let test;

  switch (operator) {
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const target = toStored(spec, raw);
      test = (row) => {
        if (row[name] === null) return false;
        const order = compareValues(spec, row[name], target);
        return {
          eq: order === 0,
          neq: order !== 0,
          gt: order > 0,
          gte: order >= 0,
          lt: order < 0,
          lte: order <= 0
        }[operator];
      };
      break;
    }
    case "is": {
      const target = { null: null, true: true, false: false }[raw.toLowerCase()];
      if (target === undefined) throw new PgError(400, "PGRST100", `failed to parse filter (${expression})`);
      test = (row) => row[name] === target;
      break;
    }
    case "in": {
      if (!raw.startsWith("(") || !raw.endsWith(")")) {
        throw new PgError(400, "PGRST100", `failed to parse filter (${expression})`);
      }
      const values = splitTopLevel(raw.slice(1, -1)).map((item) =>
        toStored(spec, item.startsWith('"') && item.endsWith('"') ? item.slice(1, -1) : item)
      );
      test = (row) => row[name] !== null && values.some((value) => compareValues(spec, row[name], value) === 0);
      break;
    }
    case "like":
    case "ilike": {
      const regex = likePattern(raw, operator === "ilike");
      test = (row) => row[name] !== null && regex.test(String(row[name]));
      break;
    }
    default:
      throw new PgError(400, "PGRST100", `unknown operator "${operator}" in filter (${expression})`);
  }

  // SQL NOT keeps NULL as NULL, so a negated comparison still skips nulls,
  // except for "is", which never produces NULL.
  if (!negate) return test;
  return operator === "is" ? (row) => !test(row) : (row) => row[name] !== null && !test(row);
}

function parseFilters(table, params) {
  const filters = [];
  for (const [key, value] of params) {
    if (RESERVED_PARAMS.has(key)) continue;
    if (key.includes(".")) {
      throw new PgError(400, "PGRST100", `the stand-in does not support filters on embedded resources (${key})`);
    }
    filters.push(buildFilter(table, key, value));
  }
  return filters;
}

function parseSelect(text) {
  const shape = { star: false, columns: [], embeds: [] };

  for (const item of splitTopLevel(text || "*")) {
    const open = item.indexOf("(");
    if (open !== -1 && item.endsWith(")")) {
      shape.embeds.push({ name: item.slice(0, open), shape: parseSelect(item.slice(open + 1, -1)) });
    } else if (item === "*") {
      shape.star = true;
    } else {
      shape.columns.push(item);
    }
  }

  return shape;
}

function parseOrder(table, text) {
  if (!text) return [];
  return text.split(",").map((term) => {
    const [name, direction = "asc", nulls] = term.split(".");
    const spec = columnSpec(table, name);
    const descending = direction === "desc";
    // Postgres puts nulls last going up and first going down unless told.
    const nullsFirst = nulls ? nulls === "nullsfirst" : descending;
    return { name, spec, descending, nullsFirst };
  });
}

function sortRows(rows, order) {
  return [...rows].sort((a, b) => {
    for (const term of order) {
      const left = a[term.name];
      const right = b[term.name];
      if (left === null && right === null) continue;
      if (left === null) return term.nullsFirst ? -1 : 1;
      if (right === null) return term.nullsFirst ? 1 : -1;
      const result = compareValues(term.spec, left, right);
      if (result !== 0) return term.descending ? -result : result;
    }
    return 0;
  });
}

// ---------------------------------------------------------------------------
// The database
// ---------------------------------------------------------------------------

function createDatabase() {
  const tables = Object.fromEntries(Object.keys(SCHEMA).map((name) => [name, []]));

  function requireTable(name) {
    if (!SCHEMA[name]) {
      throw new PgError(404, "PGRST205", `Could not find the table 'public.${name}' in the schema cache`);
    }
    return tables[name];
  }

  function validate(table, row) {
    for (const [name, spec] of Object.entries(SCHEMA[table].columns)) {
      if (spec.notNull && row[name] === null) {
        throw new PgError(
          400,
          "23502",
          `null value in column "${name}" of relation "${table}" violates not-null constraint`
        );
      }
    }

    for (const [constraint, check] of SCHEMA[table].checks) {
      if (!check(row)) {
        throw new PgError(
          400,
          "23514",
          `new row for relation "${table}" violates check constraint "${constraint}"`
        );
      }
    }

    for (const key of FOREIGN_KEYS.filter((item) => item.table === table)) {
      const value = row[key.column];
      if (value === null) continue;
      if (!tables[key.references].some((parent) => parent.id === value)) {
        throw new PgError(
          409,
          "23503",
          `insert or update on table "${table}" violates foreign key constraint "${table}_${key.column}_fkey"`,
          `Key (${key.column})=(${value}) is not present in table "${key.references}".`
        );
      }
    }
  }

  function buildRow(table, input, columnsParam) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new PgError(400, "PGRST102", "All object keys must match");
    }

    const allowed = columnsParam
      ? new Set(columnsParam.split(",").map((name) => name.replace(/"/g, "")))
      : null;

    const row = {};
    for (const [name, spec] of Object.entries(SCHEMA[table].columns)) {
      const supplied = allowed ? allowed.has(name) : Object.hasOwn(input, name);
      row[name] = supplied ? toStored(spec, input[name]) : spec.default ? spec.default() : null;
    }

    for (const name of Object.keys(input)) columnSpec(table, name);
    return row;
  }

  /** Deletes rows, following every foreign key that points at them. */
  function removeRows(table, doomed) {
    if (doomed.length === 0) return;
    const ids = new Set(doomed.map((row) => row.id));
    tables[table] = tables[table].filter((row) => !ids.has(row.id));

    for (const key of FOREIGN_KEYS.filter((item) => item.references === table)) {
      const children = tables[key.table].filter((row) => ids.has(row[key.column]));
      if (key.onDelete === "cascade") {
        removeRows(key.table, children);
      } else {
        for (const child of children) child[key.column] = null;
      }
    }
  }

  function embed(table, row, item) {
    const child = FOREIGN_KEYS.find((key) => key.table === item.name && key.references === table);
    if (child) {
      return tables[child.table]
        .filter((candidate) => candidate[child.column] === row.id)
        .map((candidate) => project(child.table, candidate, item.shape));
    }

    const parent = FOREIGN_KEYS.find((key) => key.table === table && key.references === item.name);
    if (parent) {
      const found = tables[parent.references].find((candidate) => candidate.id === row[parent.column]);
      return found ? project(parent.references, found, item.shape) : null;
    }

    throw new PgError(
      400,
      "PGRST200",
      `Could not find a relationship between '${table}' and '${item.name}' in the schema cache`
    );
  }

  function project(table, row, shape) {
    const out = {};
    const columns = SCHEMA[table].columns;

    if (shape.star) {
      for (const [name, spec] of Object.entries(columns)) out[name] = toJson(spec, row[name]);
    }
    for (const name of shape.columns) out[name] = toJson(columnSpec(table, name), row[name]);
    for (const item of shape.embeds) out[item.name] = embed(table, row, item);

    return out;
  }

  function select(table, params) {
    const rows = requireTable(table);
    const filters = parseFilters(table, params);
    const order = parseOrder(table, params.get("order"));
    const limit = params.has("limit") ? Number(params.get("limit")) : MAX_ROWS;
    const offset = params.has("offset") ? Number(params.get("offset")) : 0;

    const matched = sortRows(
      rows.filter((row) => filters.every((filter) => filter(row))),
      order
    );

    const shape = parseSelect(params.get("select"));
    return {
      rows: matched
        .slice(offset, offset + Math.min(limit, MAX_ROWS))
        .map((row) => project(table, row, shape)),
      total: matched.length
    };
  }

  function insert(table, body, params) {
    requireTable(table);
    const inputs = Array.isArray(body) ? body : [body];
    const rows = inputs.map((input) => buildRow(table, input, params.get("columns")));

    // One statement: every row is checked before any of them is kept, so a
    // bad row in a batch leaves nothing behind.
    const staged = [...tables[table]];
    for (const row of rows) {
      if (staged.some((existing) => existing.id === row.id)) {
        throw new PgError(
          409,
          "23505",
          `duplicate key value violates unique constraint "${table}_pkey"`,
          `Key (id)=(${row.id}) already exists.`
        );
      }
      staged.push(row);
    }
    for (const row of rows) validate(table, row);

    tables[table].push(...rows);
    return rows;
  }

  function update(table, body, params) {
    const rows = requireTable(table);
    const filters = parseFilters(table, params);
    if (filters.length === 0) throw new PgError(400, "21000", "UPDATE requires a WHERE clause");
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new PgError(400, "PGRST102", "Expected a single object to update with");
    }

    const patch = {};
    for (const [name, value] of Object.entries(body)) patch[name] = toStored(columnSpec(table, name), value);

    const matched = rows.filter((row) => filters.every((filter) => filter(row)));
    const hook = SCHEMA[table].beforeUpdate ?? ((row) => row);
    const next = matched.map((row) => hook({ ...row, ...patch }));
    for (const row of next) validate(table, row);

    matched.forEach((row, index) => Object.assign(row, next[index]));
    return matched;
  }

  function remove(table, params) {
    const rows = requireTable(table);
    const filters = parseFilters(table, params);
    if (filters.length === 0) throw new PgError(400, "21000", "DELETE requires a WHERE clause");

    const doomed = rows.filter((row) => filters.every((filter) => filter(row)));
    const copies = doomed.map((row) => ({ ...row }));
    removeRows(table, doomed);
    return copies;
  }

  return { tables, select, insert, update, remove, project, requireTable };
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

function base64Url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function createAuth(db) {
  const users = new Map();
  const accessTokens = new Map();
  const refreshTokens = new Map();

  function publicUser(user) {
    return {
      id: user.id,
      aud: "authenticated",
      role: "authenticated",
      email: user.email,
      email_confirmed_at: user.createdAt,
      phone: "",
      confirmed_at: user.createdAt,
      last_sign_in_at: nowIso(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { ...user.metadata },
      identities: [],
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      is_anonymous: false
    };
  }

  function issueSession(user, sessionId = randomUUID()) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + 3600;
    const accessToken = [
      base64Url({ alg: "HS256", typ: "JWT" }),
      base64Url({
        aud: "authenticated",
        exp: expiresAt,
        iat: issuedAt,
        sub: user.id,
        email: user.email,
        role: "authenticated",
        session_id: sessionId
      }),
      base64Url(`standin-${randomUUID()}`)
    ].join(".");
    const refreshToken = randomUUID().replace(/-/g, "");

    accessTokens.set(accessToken, { userId: user.id, sessionId, expiresAt });
    refreshTokens.set(refreshToken, { userId: user.id, sessionId });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: expiresAt,
      refresh_token: refreshToken,
      user: publicUser(user)
    };
  }

  function createUser({ email, password, metadata = {} }) {
    const normalized = String(email ?? "").trim().toLowerCase();
    if ([...users.values()].some((user) => user.email === normalized)) {
      throw new PgError(422, "user_already_exists", "User already registered");
    }

    const user = {
      id: randomUUID(),
      email: normalized,
      password: String(password ?? ""),
      metadata: { ...metadata },
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    users.set(user.id, user);

    // The handle_new_user trigger from 0002.
    db.insert(
      "profiles",
      {
        id: user.id,
        full_name:
          typeof metadata.full_name === "string" && metadata.full_name.length > 0
            ? metadata.full_name
            : normalized.split("@")[0],
        email: normalized
      },
      new URLSearchParams()
    );

    return user;
  }

  /** The signed-in user a bearer token belongs to, or null if it is not live. */
  function userForToken(token) {
    const entry = accessTokens.get(token);
    if (!entry || entry.expiresAt * 1000 <= Date.now()) return null;
    return users.get(entry.userId) ?? null;
  }

  function endSessions(predicate) {
    for (const [token, entry] of accessTokens) if (predicate(entry)) accessTokens.delete(token);
    for (const [token, entry] of refreshTokens) if (predicate(entry)) refreshTokens.delete(token);
  }

  return {
    users,
    publicUser,
    issueSession,
    createUser,
    userForToken,
    signIn(email, password) {
      const normalized = String(email ?? "").trim().toLowerCase();
      const user = [...users.values()].find((item) => item.email === normalized);
      if (!user || user.password !== password) return null;
      return issueSession(user);
    },
    refresh(refreshToken) {
      const entry = refreshTokens.get(refreshToken);
      if (!entry) return null;
      refreshTokens.delete(refreshToken);
      const user = users.get(entry.userId);
      return user ? issueSession(user, entry.sessionId) : null;
    },
    signOut(token, scope) {
      const entry = accessTokens.get(token);
      if (!entry) return;
      if (scope === "others") {
        endSessions((item) => item.userId === entry.userId && item.sessionId !== entry.sessionId);
      } else if (scope === "local") {
        endSessions((item) => item.sessionId === entry.sessionId);
      } else {
        endSessions((item) => item.userId === entry.userId);
      }
    },
    /** Ends every session a user has, the way an expiry or a revoke would. */
    expireSessions(userId) {
      endSessions((item) => item.userId === userId);
    }
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (text.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new PgError(400, "PGRST102", "Empty or invalid json"));
      }
    });
    request.on("error", reject);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startStandin({ port = 54399, host = "127.0.0.1" } = {}) {
  const db = createDatabase();
  const auth = createAuth(db);
  const state = { latencyMs: 0, faults: [], requests: [] };

  function send(response, status, payload, headers = {}) {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    response.writeHead(status, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Content-Range",
      ...(body.length > 0 ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...headers
    });
    response.end(body);
  }

  function sendPgError(response, error) {
    send(response, error.status, {
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message
    });
  }

  function sendAuthError(response, status, code, message) {
    send(response, status, { code: status, error_code: code, msg: message });
  }

  function bearer(request) {
    const header = request.headers.authorization ?? "";
    return header.startsWith("Bearer ") ? header.slice(7) : "";
  }

  /** Finds the first injected fault this request trips, and uses it up. */
  function takeFault(method, table) {
    const fault = state.faults.find((item) => item.method === method && item.table === table);
    if (!fault) return null;

    if (fault.skip > 0) {
      fault.skip -= 1;
      return null;
    }

    fault.times -= 1;
    if (fault.times <= 0) state.faults.splice(state.faults.indexOf(fault), 1);
    return fault;
  }

  async function handleRest(request, response, url, table) {
    const method = request.method;
    const params = url.searchParams;
    const accept = request.headers.accept ?? "";
    const prefer = request.headers.prefer ?? "";
    const wantsObject = accept.includes("application/vnd.pgrst.object+json");
    const wantsRows = prefer.includes("return=representation");

    if (state.latencyMs > 0) await sleep(state.latencyMs);
    state.requests.push({ method, table, search: url.search });

    const fault = takeFault(method, table);
    if (fault) throw new PgError(fault.status ?? 500, "XX000", "injected failure");

    let rows;
    let status;
    let headers = {};

    if (method === "GET" || method === "HEAD") {
      const result = db.select(table, params);
      rows = result.rows;
      status = 200;

      // Asked for, PostgREST reports the full count as "first-last/total".
      if (prefer.includes("count=exact")) {
        const first = Number(params.get("offset") ?? 0);
        const range = rows.length > 0 ? `${first}-${first + rows.length - 1}` : "*";
        headers = { "Content-Range": `${range}/${result.total}` };
      }
    } else {
      const body = await readBody(request);
      const shape = parseSelect(params.get("select"));
      let changed;

      if (method === "POST") {
        changed = db.insert(table, body, params);
        status = 201;
      } else if (method === "PATCH") {
        changed = db.update(table, body, params);
        status = wantsRows ? 200 : 204;
      } else if (method === "DELETE") {
        changed = db.remove(table, params);
        status = wantsRows ? 200 : 204;
      } else {
        throw new PgError(405, "PGRST117", `Unsupported HTTP method: ${method}`);
      }

      if (!wantsRows) return send(response, status);
      rows = changed.map((row) => db.project(table, row, shape));
    }

    if (wantsObject) {
      if (rows.length !== 1) {
        throw new PgError(
          406,
          "PGRST116",
          "JSON object requested, multiple (or no) rows returned",
          `The result contains ${rows.length} rows`
        );
      }
      return send(response, status, rows[0], headers);
    }

    return send(response, status, rows, headers);
  }

  async function handleAuth(request, response, url, route) {
    // Faults for the auth server are registered with a table of "auth/<route>",
    // e.g. "auth/user", standing in for the auth server being down.
    const fault = takeFault(request.method, `auth/${route}`);
    if (fault) return sendAuthError(response, fault.status ?? 503, "unavailable", "injected failure");

    if (route === "signup" && request.method === "POST") {
      const body = (await readBody(request)) ?? {};
      try {
        const user = auth.createUser({ email: body.email, password: body.password, metadata: body.data ?? {} });
        return send(response, 200, auth.issueSession(user));
      } catch (error) {
        if (error instanceof PgError && error.code === "user_already_exists") {
          return sendAuthError(response, 422, "user_already_exists", "User already registered");
        }
        throw error;
      }
    }

    if (route === "token" && request.method === "POST") {
      const body = (await readBody(request)) ?? {};
      const grant = url.searchParams.get("grant_type");

      if (grant === "password") {
        const session = auth.signIn(body.email, body.password);
        return session
          ? send(response, 200, session)
          : sendAuthError(response, 400, "invalid_credentials", "Invalid login credentials");
      }

      if (grant === "refresh_token") {
        const session = auth.refresh(body.refresh_token);
        return session
          ? send(response, 200, session)
          : sendAuthError(response, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      }

      return sendAuthError(response, 400, "unsupported_grant_type", "Unsupported grant type");
    }

    if (route === "user") {
      const user = auth.userForToken(bearer(request));
      if (!user) {
        return sendAuthError(response, 403, "bad_jwt", "invalid JWT: unable to parse or verify signature, token is expired or its session has ended");
      }

      if (request.method === "GET") return send(response, 200, auth.publicUser(user));

      if (request.method === "PUT") {
        const body = (await readBody(request)) ?? {};
        if (body.data && typeof body.data === "object") user.metadata = { ...user.metadata, ...body.data };
        if (typeof body.password === "string") user.password = body.password;
        user.updatedAt = nowIso();

        // The handle_user_update trigger from 0002, which keeps the old name
        // when the metadata has none.
        const params = new URLSearchParams({ id: `eq.${user.id}` });
        db.update(
          "profiles",
          typeof user.metadata.full_name === "string"
            ? { full_name: user.metadata.full_name, email: user.email }
            : { email: user.email },
          params
        );
        return send(response, 200, auth.publicUser(user));
      }
    }

    if (route === "logout" && request.method === "POST") {
      auth.signOut(bearer(request), url.searchParams.get("scope") ?? "global");
      return send(response, 204);
    }

    if (route === "settings" && request.method === "GET") {
      return send(response, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });
    }

    return sendAuthError(response, 404, "not_found", `The stand-in does not implement ${request.method} /auth/v1/${route}`);
  }

  async function handleControl(request, response, url, parts) {
    const [area, table, id] = parts;
    const body = request.method === "GET" ? undefined : ((await readBody(request)) ?? {});

    if (area === "users" && request.method === "POST") {
      const user = auth.createUser({
        email: body.email ?? `${randomUUID()}@standin.test`,
        password: body.password ?? "password1",
        metadata: body.fullName ? { full_name: body.fullName } : {}
      });
      return send(response, 200, { user: auth.publicUser(user), session: auth.issueSession(user) });
    }

    if (area === "expire-sessions" && request.method === "POST") {
      auth.expireSessions(body.userId);
      return send(response, 200, { ok: true });
    }

    if (area === "faults" && request.method === "POST") {
      state.faults.push({ times: 1, skip: 0, ...body });
      return send(response, 200, { faults: state.faults.length });
    }

    if (area === "latency" && request.method === "POST") {
      state.latencyMs = Math.max(0, Number(body.ms) || 0);
      return send(response, 200, { latencyMs: state.latencyMs });
    }

    if (area === "requests" && request.method === "GET") {
      return send(response, 200, { requests: state.requests });
    }

    if (area === "rows" && table) {
      db.requireTable(table);
      if (request.method === "GET") {
        return send(response, 200, { rows: db.select(table, url.searchParams).rows });
      }
      // Direct edits, standing in for someone with the SQL editor open: for
      // example backdating an attempt so its time limit has already passed.
      if (request.method === "PATCH" && id) {
        const params = new URLSearchParams({ id: `eq.${id}` });
        const [row] = db.update(table, body, params);
        return send(response, row ? 200 : 404, row ? db.project(table, row, parseSelect("*")) : { message: "not found" });
      }
    }

    return send(response, 404, { message: `Unknown stand-in control route ${request.method} ${url.pathname}` });
  }

  const server = http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": request.headers["access-control-request-headers"] ?? "*",
        "Access-Control-Max-Age": "600"
      });
      return response.end();
    }

    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const parts = url.pathname.split("/").filter(Boolean);

    try {
      if (parts[0] === "rest" && parts[1] === "v1" && parts.length === 3) {
        return await handleRest(request, response, url, decodeURIComponent(parts[2]));
      }
      if (parts[0] === "auth" && parts[1] === "v1" && parts.length === 3) {
        return await handleAuth(request, response, url, parts[2]);
      }
      if (parts[0] === "__standin") {
        return await handleControl(request, response, url, parts.slice(1));
      }
      return send(response, 404, { message: `The stand-in does not serve ${url.pathname}` });
    } catch (error) {
      if (error instanceof PgError) return sendPgError(response, error);
      console.error("[standin]", error);
      return send(response, 500, { message: String(error?.message ?? error) });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const baseUrl = `http://${host}:${address.port}`;

  return {
    url: baseUrl,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const portArg = process.argv.indexOf("--port");
  const port = portArg === -1 ? 54399 : Number(process.argv[portArg + 1]);
  const standin = await startStandin({ port });
  console.log(`Supabase stand-in listening on ${standin.url}`);
}
