/**
 * A local stand-in for the three Supabase services this app talks to.
 *
 *   node scripts/supabase-standin.mjs            (listens on 54399)
 *
 * It answers the PostgREST calls the API makes (/rest/v1) against the four
 * tables in supabase/migrations that the API reads and writes, the GoTrue
 * calls both the API and the browser make (/auth/v1) for accounts, including
 * the admin calls the API makes with the service role key, and the storage
 * calls (/storage/v1) for profile photos. It holds everything in memory and
 * needs nothing installed.
 *
 * It also plays Google, so signing in with Google and connecting it from the
 * profile page can be tried in a browser with no Google project: the trip to
 * Google comes straight back the way Supabase sends it, signed in as the one
 * Google account set through POST /__standin/google. To try the app against
 * it, run the API with SUPABASE_URL pointing here and SUPABASE_SERVICE_ROLE_KEY
 * set to anything, and the web app with VITE_SUPABASE_URL pointing here and
 * VITE_SUPABASE_ANON_KEY set to anything.
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
 * Two differences worth knowing when reading a passing run:
 *
 *   * Tokens here are signed with a shared secret, so `getClaims` in the API
 *     falls back to asking this stand-in about every one. A real project
 *     signing with asymmetric keys checks the signature on its own and cannot
 *     tell that a session has been signed out, which is why deleting an
 *     account asks the auth server outright (see isLiveSession).
 *   * The profiles table here is written by this file imitating the triggers in
 *     the migrations, not by the triggers themselves. Keep the two in step:
 *     what `createUser` does is meant to be what 0007's handle_new_user does.
 *
 * Tests steer it through /__standin: create accounts, expire their sessions,
 * inject failures and latency, and read or edit rows directly.
 */

import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
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

/** The tables the API touches, as the migrations leave them after 0001-0007. */
const SCHEMA = {
  profiles: {
    columns: {
      id: column("uuid", { notNull: true }),
      full_name: column("text"),
      email: column("text"),
      grade_level: column("int", { notNull: true, default: () => 9 }),
      created_at: column("timestamptz", { notNull: true, default: nowIso }),
      avatar_url: column("text")
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

  function appMetadata(user) {
    return { provider: user.provider, providers: [...new Set(user.identities.map((identity) => identity.provider))] };
  }

  /** One way into an account, as GoTrue lists it under `identities`. */
  function newIdentity(user, provider, email) {
    return {
      identity_id: randomUUID(),
      id: provider === "email" ? user.id : `google-${randomUUID()}`,
      user_id: user.id,
      provider,
      identity_data: { email, sub: user.id, email_verified: true },
      created_at: nowIso(),
      last_sign_in_at: nowIso(),
      updated_at: nowIso()
    };
  }

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
      app_metadata: appMetadata(user),
      user_metadata: { ...user.metadata },
      identities: user.identities.map((identity) => structuredClone(identity)),
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
        // Real tokens carry both, and the API reads them when it has to make
        // a missing profile.
        app_metadata: appMetadata(user),
        user_metadata: { ...user.metadata },
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

  /**
   * Makes an account. `provider` is how it signed up: "email", or "google",
   * whose metadata carries the Google name and photo the way Supabase's does.
   */
  function createUser({ email, password, metadata = {}, provider = "email" }) {
    const normalized = String(email ?? "").trim().toLowerCase();
    if ([...users.values()].some((user) => user.email === normalized)) {
      throw new PgError(422, "user_already_exists", "User already registered");
    }

    const user = {
      id: randomUUID(),
      email: normalized,
      // An account made through Google has no password until one is set.
      password: password === null || password === undefined ? null : String(password),
      metadata: { ...metadata },
      provider,
      identities: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    user.identities.push(newIdentity(user, provider, normalized));
    users.set(user.id, user);

    const text = (key) => (typeof metadata[key] === "string" ? metadata[key].trim() : "");
    const googlePhoto = provider === "google" ? text("avatar_url") || text("picture") : "";

    // The handle_new_user trigger, as 0007 leaves it: the name squeezed onto
    // one line and cut to 60 characters, and the photo taken only from a
    // Google sign-up, and only from one of Google's own addresses.
    db.insert(
      "profiles",
      {
        id: user.id,
        full_name: (text("full_name") || text("name") || normalized.split("@")[0])
          .replace(/\s+/g, " ")
          .slice(0, 60),
        email: normalized,
        avatar_url: /^https:\/\/([a-z0-9-]+\.)*googleusercontent\.com\//i.test(googlePhoto) ? googlePhoto : null
      },
      new URLSearchParams()
    );

    return user;
  }

  /**
   * The handle_user_update trigger, as 0007 leaves it: only the email is kept
   * in step. A new name in the metadata, which is what every Google sign-in
   * writes, no longer reaches the profile.
   */
  function userUpdated(user, previousEmail) {
    user.updatedAt = nowIso();
    if (user.email !== previousEmail) {
      db.update("profiles", { email: user.email }, new URLSearchParams({ id: `eq.${user.id}` }));
    }
  }

  function updateMetadata(user, changes) {
    user.metadata = { ...user.metadata, ...changes };
    userUpdated(user, user.email);
  }

  /** profiles.id references auth.users on delete cascade, and the rest hangs off the profile. */
  function deleteUser(userId) {
    users.delete(userId);
    endSessions((entry) => entry.userId === userId);
    db.remove("profiles", new URLSearchParams({ id: `eq.${userId}` }));
  }

  function googleIdentityOwner(email) {
    return [...users.values()].find((user) =>
      user.identities.some((identity) => identity.provider === "google" && identity.identity_data.email === email)
    );
  }

  function googleMetadata({ email, name, picture }) {
    return { full_name: name, name, avatar_url: picture, picture, email, email_verified: true };
  }

  /**
   * Signing in with Google, the three ways GoTrue decides it: an account
   * already has this Google identity; an account has the same (verified)
   * email, and Google is linked onto it automatically; or there is no account
   * yet and one is made. The first two write Google's name and photo over the
   * account's metadata, which is exactly what the profile has to survive.
   */
  function signInWithGoogle(account) {
    const email = String(account.email).trim().toLowerCase();

    const linked = googleIdentityOwner(email);
    if (linked) {
      updateMetadata(linked, googleMetadata({ ...account, email }));
      return linked;
    }

    const sameEmail = [...users.values()].find((user) => user.email === email);
    if (sameEmail) {
      sameEmail.identities.push(newIdentity(sameEmail, "google", email));
      updateMetadata(sameEmail, googleMetadata({ ...account, email }));
      return sameEmail;
    }

    return createUser({ email, password: null, metadata: googleMetadata({ ...account, email }), provider: "google" });
  }

  /** Connecting Google to an account that is signed in, from its profile. */
  function linkGoogle(user, account) {
    const email = String(account.email).trim().toLowerCase();
    const owner = googleIdentityOwner(email);

    if (owner && owner.id !== user.id) {
      throw new PgError(422, "identity_already_exists", "Identity is already linked to another user");
    }

    if (!owner) user.identities.push(newIdentity(user, "google", email));
    updateMetadata(user, googleMetadata({ ...account, email }));
  }

  function unlinkIdentity(user, identityId) {
    if (user.identities.length <= 1) {
      throw new PgError(422, "single_identity_not_deletable", "User must have at least 1 identity after unlinking");
    }

    const index = user.identities.findIndex((identity) => identity.identity_id === identityId);
    if (index === -1) throw new PgError(404, "identity_not_found", "Identity doesn't exist");

    user.identities.splice(index, 1);
    user.updatedAt = nowIso();
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
    userUpdated,
    updateMetadata,
    deleteUser,
    signInWithGoogle,
    linkGoogle,
    unlinkIdentity,
    signIn(email, password) {
      const normalized = String(email ?? "").trim().toLowerCase();
      const user = [...users.values()].find((item) => item.email === normalized);
      if (!user || user.password === null || user.password !== password) return null;
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

/** A request body as bytes, for uploads, which are not JSON. */
function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Where the photo on somebody's Google account would live.
 *
 * One of Google's own addresses, because that is all the app stores. Nothing
 * is served from it, so a browser shows the student's initials instead, which
 * is what a Google photo that has since been changed does too.
 */
const STANDIN_GOOGLE_PHOTO = "https://lh3.googleusercontent.com/a/standin-google-student";

export async function startStandin({ port = 54399, host = "127.0.0.1" } = {}) {
  const db = createDatabase();
  const auth = createAuth(db);
  const state = {
    latencyMs: 0,
    faults: [],
    requests: [],
    // Google, as far as the stand-in plays it: switched on, allowing accounts
    // to connect it, with one Google account that every trip signs in as.
    // A test changes any of it through POST /__standin/google, and sets
    // `nextError` to make the next trip come back failed.
    google: {
      enabled: true,
      manualLinking: true,
      account: { email: "google.student@standin.test", name: "Google Student", picture: STANDIN_GOOGLE_PHOTO },
      nextError: null
    }
  };

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

      // The pkce half of the trip: the code from the address, plus the
      // verifier the browser kept, swapped for the session.
      if (grant === "pkce") {
        const pending = authCodes.get(body.auth_code);
        authCodes.delete(body.auth_code);

        if (!pending) {
          return sendAuthError(response, 404, "flow_state_not_found", "invalid flow state, no valid flow state found");
        }

        if (typeof body.code_verifier !== "string" || s256(body.code_verifier) !== pending.challenge) {
          return sendAuthError(
            response,
            400,
            "bad_code_verifier",
            "code challenge does not match previously saved code verifier"
          );
        }

        const user = auth.users.get(pending.userId);
        return user
          ? send(response, 200, auth.issueSession(user))
          : sendAuthError(response, 404, "user_not_found", "User not found");
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
        auth.userUpdated(user, user.email);
        return send(response, 200, auth.publicUser(user));
      }
    }

    if (route === "logout" && request.method === "POST") {
      auth.signOut(bearer(request), url.searchParams.get("scope") ?? "global");
      return send(response, 204);
    }

    if (route === "settings" && request.method === "GET") {
      return send(response, 200, {
        external: { email: true, google: state.google.enabled },
        disable_signup: false,
        mailer_autoconfirm: true
      });
    }

    // The browser is sent here to sign in with Google. There is no Google
    // screen: the stand-in answers as if the student had picked the account.
    if (route === "authorize" && request.method === "GET") {
      if (url.searchParams.get("provider") !== "google" || !state.google.enabled) {
        return sendAuthError(response, 400, "validation_failed", "Unsupported provider: provider is not enabled");
      }

      const redirectTo = url.searchParams.get("redirect_to");
      if (!redirectTo) return sendAuthError(response, 400, "validation_failed", "The stand-in needs a redirect_to");

      const failure = takeGoogleError();
      if (failure) return redirectWithError(response, redirectTo, failure);

      const user = auth.signInWithGoogle(state.google.account);
      return redirectSignedIn(response, redirectTo, user, url.searchParams.get("code_challenge"));
    }

    return sendAuthError(response, 404, "not_found", `The stand-in does not implement ${request.method} /auth/v1/${route}`);
  }

  function takeGoogleError() {
    const failure = state.google.nextError;
    state.google.nextError = null;
    return failure;
  }

  /**
   * Codes handed out by the authorize endpoints, waiting to be swapped for a
   * session. One use each, as GoTrue's are.
   */
  const authCodes = new Map();

  const s256 = (verifier) => createHash("sha256").update(verifier).digest("base64url");

  /**
   * Back to the app the way the pkce flow does it: a one-time code in the
   * query, worth nothing without the verifier the browser kept.
   */
  function redirectWithCode(response, redirectTo, user, challenge) {
    const code = randomUUID();
    authCodes.set(code, { userId: user.id, challenge });

    const address = new URL(redirectTo);
    address.searchParams.set("code", code);

    response.writeHead(302, { Location: address.toString() });
    response.end();
  }

  /**
   * Finishes a trip to Google, in whichever flow the client asked for.
   *
   * A `code_challenge` on the way out means pkce, which is what the web app
   * uses; without one it is the implicit flow, which returns the tokens
   * themselves. Both are here so the stand-in keeps matching the app if that
   * setting ever changes.
   */
  function redirectSignedIn(response, redirectTo, user, challenge) {
    return challenge
      ? redirectWithCode(response, redirectTo, user, challenge)
      : redirectWithSession(response, redirectTo, auth.issueSession(user));
  }

  /**
   * Back to the app with a session, the way GoTrue's implicit flow does it: the
   * tokens joined onto the address after a "#", by plain string joining.
   */
  function redirectWithSession(response, redirectTo, session) {
    const fragment = new URLSearchParams({
      access_token: session.access_token,
      expires_at: String(session.expires_at),
      expires_in: String(session.expires_in),
      provider_token: "standin-google-token",
      refresh_token: session.refresh_token,
      sb: "",
      token_type: "bearer"
    });

    response.writeHead(302, { Location: `${redirectTo}#${fragment.toString()}` });
    response.end();
  }

  /** Back to the app with a failure, which GoTrue puts in both the query and the fragment. */
  function redirectWithError(response, redirectTo, { error = "server_error", code = "", description = "" }) {
    const address = new URL(redirectTo);
    const params = new URLSearchParams({ error, error_code: code, error_description: description });
    for (const [name, value] of params) address.searchParams.set(name, value);
    address.hash = params.toString();

    response.writeHead(302, { Location: address.toString() });
    response.end();
  }

  /** /auth/v1/user/identities/...: starting to connect Google, and disconnecting it. */
  async function handleIdentities(request, response, url, rest) {
    const user = auth.userForToken(bearer(request));
    if (!user) return sendAuthError(response, 401, "no_authorization", "This endpoint requires a valid Bearer token");

    if (rest.length === 1 && rest[0] === "authorize" && request.method === "GET") {
      if (url.searchParams.get("provider") !== "google" || !state.google.enabled) {
        return sendAuthError(response, 400, "validation_failed", "Unsupported provider: provider is not enabled");
      }
      if (!state.google.manualLinking) {
        return sendAuthError(response, 422, "manual_linking_disabled", "Manual linking is disabled");
      }

      // The client asks for the address rather than being redirected, then
      // sends the browser there itself.
      const next = new URL(`http://${request.headers.host}/auth/v1/__google/link`);
      next.searchParams.set("user", user.id);
      next.searchParams.set("redirect_to", url.searchParams.get("redirect_to") ?? "");

      // Connecting Google goes through the same flow as signing in with it, so
      // the challenge has to survive the hop through the page below.
      const challenge = url.searchParams.get("code_challenge");
      if (challenge) next.searchParams.set("code_challenge", challenge);

      return send(response, 200, { url: next.toString() });
    }

    if (rest.length === 1 && request.method === "DELETE") {
      try {
        auth.unlinkIdentity(user, rest[0]);
      } catch (error) {
        if (error instanceof PgError) return sendAuthError(response, error.status, error.code, error.message);
        throw error;
      }
      return send(response, 200, {});
    }

    return sendAuthError(response, 404, "not_found", `The stand-in does not implement ${request.method} ${url.pathname}`);
  }

  /** Where the browser lands to finish connecting Google, standing in for Google's own screen. */
  function handleGoogleLink(request, response, url) {
    const user = auth.users.get(url.searchParams.get("user") ?? "");
    const redirectTo = url.searchParams.get("redirect_to");
    if (!user || !redirectTo) return send(response, 400, { message: "The stand-in needs a user and a redirect_to" });

    const failure = takeGoogleError();
    if (failure) return redirectWithError(response, redirectTo, failure);

    try {
      auth.linkGoogle(user, state.google.account);
    } catch (error) {
      if (error instanceof PgError && error.code === "identity_already_exists") {
        return redirectWithError(response, redirectTo, {
          error: "invalid_request",
          code: "identity_already_exists",
          description: error.message
        });
      }
      throw error;
    }

    return redirectSignedIn(response, redirectTo, user, url.searchParams.get("code_challenge"));
  }

  /**
   * The admin API the server side calls with the service role key: here,
   * reading, updating and deleting one user.
   */
  async function handleAdminUser(request, response, userId) {
    const fault = takeFault(request.method, "auth/admin");
    if (fault) return sendAuthError(response, fault.status ?? 503, "unavailable", "injected failure");

    // Supabase refuses the admin API to anything but the service role key,
    // and a student's own token is the likeliest wrong key to be sent.
    if (auth.userForToken(bearer(request))) {
      return sendAuthError(response, 403, "not_admin", "User not allowed");
    }

    const user = auth.users.get(userId);
    if (!user) return sendAuthError(response, 404, "user_not_found", "User not found");

    if (request.method === "GET") return send(response, 200, auth.publicUser(user));

    if (request.method === "PUT") {
      const body = (await readBody(request)) ?? {};
      if (body.user_metadata && typeof body.user_metadata === "object") {
        auth.updateMetadata(user, body.user_metadata);
      }
      return send(response, 200, auth.publicUser(user));
    }

    if (request.method === "DELETE") {
      auth.deleteUser(user.id);
      return send(response, 200, auth.publicUser(user));
    }

    return sendAuthError(response, 405, "method_not_allowed", `Unsupported method ${request.method}`);
  }

  // -------------------------------------------------------------------------
  // Storage
  // -------------------------------------------------------------------------
  // The buckets the migrations create, both public. Objects are kept under
  // "<bucket>/<path>", holding the bytes exactly as they were uploaded.
  // Failures come back the way Supabase storage sends them: HTTP 400, with
  // the real status inside the body.

  const buckets = new Set(["question-images", "avatars"]);
  const objects = new Map();

  function sendStorageError(response, status, statusCode, error, message) {
    send(response, status, { statusCode: String(statusCode), error, message });
  }

  /** Everything under /storage/v1/object: `parts` is the path after that. */
  async function handleStorage(request, response, parts) {
    const [first, ...rest] = parts;

    if (first === "list" && request.method === "POST") {
      const bucket = rest[0];
      // Registered as "storage/<bucket>/list", so a failing list can be told
      // apart from a failing upload, which is a POST as well.
      const fault = takeFault("POST", `storage/${bucket}/list`);
      if (fault) return sendStorageError(response, 400, fault.status ?? 500, "internal", "injected failure");
      if (!buckets.has(bucket)) return sendStorageError(response, 400, 404, "Bucket not found", "Bucket not found");

      const body = (await readBody(request)) ?? {};
      const prefix = String(body.prefix ?? "").replace(/^\/+|\/+$/g, "");
      const base = prefix.length > 0 ? `${bucket}/${prefix}/` : `${bucket}/`;
      const entries = new Map();

      for (const [key, object] of objects) {
        if (!key.startsWith(base)) continue;
        const remainder = key.slice(base.length);
        const slash = remainder.indexOf("/");

        if (slash === -1) {
          entries.set(remainder, {
            name: remainder,
            id: object.id,
            created_at: object.createdAt,
            updated_at: object.createdAt,
            last_accessed_at: object.createdAt,
            metadata: { size: object.bytes.length, mimetype: object.contentType }
          });
        } else {
          // Anything deeper shows as a folder, which storage lists with no id.
          const folder = remainder.slice(0, slash);
          if (!entries.has(folder)) {
            entries.set(folder, { name: folder, id: null, created_at: null, updated_at: null, last_accessed_at: null, metadata: null });
          }
        }
      }

      const offset = Number(body.offset ?? 0);
      const limit = Number(body.limit ?? 100);
      const listed = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
      return send(response, 200, listed.slice(offset, offset + limit));
    }

    if (first === "public" && (request.method === "GET" || request.method === "HEAD")) {
      const object = buckets.has(rest[0]) ? objects.get(rest.join("/")) : undefined;
      if (!object) return sendStorageError(response, 400, 404, "not_found", "Object not found");

      response.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": object.contentType,
        "Content-Length": object.bytes.length,
        "Cache-Control": object.cacheControl
      });
      return response.end(request.method === "HEAD" ? undefined : object.bytes);
    }

    const bucket = first;
    if (!buckets.has(bucket)) return sendStorageError(response, 400, 404, "Bucket not found", "Bucket not found");

    const fault = takeFault(request.method, `storage/${bucket}`);
    if (fault) return sendStorageError(response, 400, fault.status ?? 500, "internal", "injected failure");

    if (request.method === "POST" && rest.length > 0) {
      const key = `${bucket}/${rest.join("/")}`;
      if (objects.has(key) && request.headers["x-upsert"] !== "true") {
        return sendStorageError(response, 400, 409, "Duplicate", "The resource already exists");
      }

      const object = {
        id: randomUUID(),
        bytes: await readRawBody(request),
        contentType: request.headers["content-type"] ?? "application/octet-stream",
        cacheControl: request.headers["cache-control"] ?? "no-cache",
        createdAt: nowIso()
      };
      objects.set(key, object);
      return send(response, 200, { Id: object.id, Key: key });
    }

    if (request.method === "DELETE" && rest.length === 0) {
      const body = (await readBody(request)) ?? {};
      const removed = [];

      for (const path of Array.isArray(body.prefixes) ? body.prefixes : []) {
        const key = `${bucket}/${path}`;
        const object = objects.get(key);
        if (!object) continue;
        objects.delete(key);
        removed.push({ bucket_id: bucket, name: path, id: object.id });
      }

      return send(response, 200, removed);
    }

    return sendStorageError(response, 400, 404, "not_found", `The stand-in does not implement ${request.method} on this storage path`);
  }

  async function handleControl(request, response, url, parts) {
    const [area, table, id] = parts;
    const body = request.method === "GET" || request.method === "DELETE" ? undefined : ((await readBody(request)) ?? {});

    if (area === "users" && request.method === "POST") {
      const user = auth.createUser({
        email: body.email ?? `${randomUUID()}@standin.test`,
        // A Google sign-up has no password, as on Supabase.
        password: body.password ?? (body.provider === "google" ? null : "password1"),
        metadata: body.metadata ?? (body.fullName ? { full_name: body.fullName } : {}),
        provider: body.provider ?? "email"
      });
      return send(response, 200, { user: auth.publicUser(user), session: auth.issueSession(user) });
    }

    // The account as the Supabase dashboard would show it, metadata and all.
    if (area === "users" && table && request.method === "GET") {
      const user = auth.users.get(table);
      return user ? send(response, 200, { user: auth.publicUser(user) }) : send(response, 404, { message: "no such user" });
    }

    // Stored files, as "<bucket>/<path>", optionally under ?prefix=.
    if (area === "objects" && request.method === "GET") {
      const prefix = url.searchParams.get("prefix") ?? "";
      return send(response, 200, {
        objects: [...objects.keys()].filter((key) => key.startsWith(prefix)).sort()
      });
    }

    // How Google behaves: { enabled, manualLinking, account, nextError }.
    if (area === "google" && request.method === "POST") {
      Object.assign(state.google, body);
      return send(response, 200, { google: state.google });
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

      // For example a profile that was never made, as for an account that
      // signed up before the trigger that makes them existed.
      if (request.method === "DELETE" && id) {
        const removed = db.remove(table, new URLSearchParams({ id: `eq.${id}` }));
        return send(response, removed.length > 0 ? 200 : 404, { removed: removed.length });
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
      if (parts[0] === "auth" && parts[1] === "v1" && parts[2] === "admin" && parts[3] === "users" && parts.length === 5) {
        return await handleAdminUser(request, response, decodeURIComponent(parts[4]));
      }
      if (parts[0] === "auth" && parts[1] === "v1" && parts[2] === "user" && parts[3] === "identities") {
        return await handleIdentities(request, response, url, parts.slice(4).map((part) => decodeURIComponent(part)));
      }
      if (parts[0] === "auth" && parts[1] === "v1" && parts[2] === "__google" && parts[3] === "link") {
        return handleGoogleLink(request, response, url);
      }
      if (parts[0] === "storage" && parts[1] === "v1" && parts[2] === "object") {
        return await handleStorage(request, response, parts.slice(3).map((part) => decodeURIComponent(part)));
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
