import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { env, storageMode } from "./lib/env";
import { PublicError } from "./lib/publicError";
import { adminRouter } from "./routes/admin";
import { catalogRouter } from "./routes/catalog";
import { friendsRouter } from "./routes/friends";
import { profileRouter } from "./routes/profile";
import { testsRouter } from "./routes/tests";

const app = express();

// Behind a host's proxy, read the student's own address from X-Forwarded-For
// so the per-address limits count students, not the proxy (see env.ts).
if (env.trustProxyHops > 0) {
  app.set("trust proxy", env.trustProxyHops);
}

// Vite asks for port 5173 but silently moves to 5174, 5175 and so on when
// something else already holds it, so pinning CORS to one exact origin breaks
// the app on a machine that happens to have 5173 busy. In development any
// localhost port is the dev server, so allow them all and let WEB_ORIGIN stay
// authoritative everywhere else.
const LOCALHOST_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

/**
 * A request from a page on an origin this API does not serve.
 *
 * It is refused before any route runs, so a form or script on another site
 * cannot make a student's browser act here. That refusal is the visitor's
 * page being where it should not be, not the server failing: it is a 403,
 * and it is not logged as an error on every such request, which a plain
 * Error turned into a 500 with a stack trace in the log.
 */
class OriginRefused extends Error {
  constructor(readonly origin: string) {
    super(`Origin ${origin} is not allowed by CORS.`);
    this.name = "OriginRefused";
  }
}

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin requests, curl and the smoke test send no Origin header.
      if (!origin || origin === env.webOrigin) {
        callback(null, true);
        return;
      }

      if (env.allowAnyLocalhostOrigin && LOCALHOST_ORIGIN.test(origin)) {
        callback(null, true);
        return;
      }

      callback(new OriginRefused(origin));
    },
    // A signed-in student's requests carry an Authorization header, so each
    // needs the browser's preflight check first. Without a max age browsers
    // remember the answer for about five seconds; ten minutes turns a round
    // trip on nearly every request into one per session.
    maxAge: 600
  })
);

// Question diagrams arrive base64 encoded in the JSON body, so the default
// 100kb limit is far too small.
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_request, response) => {
  response.json({ status: "ok", storageMode });
});

app.use("/api/catalog", catalogRouter);
app.use("/api/tests", testsRouter);
app.use("/api/profile", profileRouter);
app.use("/api/friends", friendsRouter);
app.use("/api/admin", adminRouter);

app.use((_request, response) => {
  response.status(404).json({ message: "Not found." });
});

/** What a failure the reader cannot be told more about says. */
const GENERIC_FAILURE = "Something went wrong on the server. Try again in a moment.";

/**
 * What express.json() attaches to a body it turned away, and what Express
 * attaches to a path it could not decode: the status the sender earned.
 */
interface BodyError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
}

app.use((error: BodyError, request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof OriginRefused) {
    return response.status(403).json({
      code: "origin-not-allowed",
      message: "This API does not take requests from that website."
    });
  }

  // A body over the limit above was answered as a 500 reading "request entity
  // too large": a picture of 4 MB, say, which grows by a third as base64. It
  // is the sender's to fix, so it is a 413 in words, before any route runs.
  if (error.type === "entity.too.large") {
    return response.status(413).json({
      code: "too-large",
      message: request.path.endsWith("/questions/image")
        ? "Images must be 2 MB or smaller."
        : "That is more than the server takes in one go (5 MB). Send it in smaller parts."
    });
  }

  if (error.type === "entity.parse.failed") {
    return response.status(400).json({ message: "That request was not valid JSON." });
  }

  // Any other request the body reader or the router could not take is the
  // sender's to fix as well: a charset other than UTF-8 or an unknown
  // Content-Encoding (415), a body that claims gzip and is not (400), or a
  // path with a broken percent escape such as /attempts/%E0%A4%A (400). Each
  // carries its own 4xx status, and each used to be answered as a 500.
  const status = error.status ?? error.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return response.status(status).json({
      message: status === 415 ? "Send the request as plain UTF-8 JSON." : "That request could not be read."
    });
  }

  // The full error, raw database wording and all, goes to the log under a
  // short reference. The response carries that reference and, unless the
  // error was written for the reader (see PublicError), only a generic
  // sentence: a database message names tables, columns and filter syntax,
  // and used to be sent to whoever asked.
  const ref = randomUUID().slice(0, 8);
  console.error(`[api] ${request.method} ${request.path} failed (ref ${ref}):`, error);
  response.status(500).json({
    message: error instanceof PublicError ? error.publicMessage : GENERIC_FAILURE,
    ref
  });
});

app.listen(env.port, () => {
  console.log(`ExamPeak API listening on http://localhost:${env.port}`);

  if (storageMode === "memory") {
    console.warn(
      "[api] Supabase is not configured, so questions and results are kept in memory only and are lost when this process restarts."
    );
    console.warn(
      "[api] Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env to store data for real."
    );
  }

  if (env.adminPasswordIsDefault && env.isProduction) {
    console.error(
      "[api] ADMIN_PASSWORD is not set, so the admin dashboard is closed: its fallback password is written in the repository for anyone to read. Set ADMIN_PASSWORD in .env and restart to open it. Everything students use is unaffected."
    );
  } else if (env.adminPasswordIsDefault) {
    console.warn(
      `[api] ADMIN_PASSWORD is not set, so the admin dashboard is using the default password "${env.adminPassword}". Set your own in .env.`
    );
  }
});
