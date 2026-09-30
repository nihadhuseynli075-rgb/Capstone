import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { env, storageMode } from "./lib/env";
import { adminRouter } from "./routes/admin";
import { catalogRouter } from "./routes/catalog";
import { profileRouter } from "./routes/profile";
import { testsRouter } from "./routes/tests";

const app = express();

// Vite asks for port 5173 but silently moves to 5174, 5175 and so on when
// something else already holds it, so pinning CORS to one exact origin breaks
// the app on a machine that happens to have 5173 busy. In development any
// localhost port is the dev server, so allow them all and let WEB_ORIGIN stay
// authoritative everywhere else.
const LOCALHOST_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

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

      callback(new Error(`Origin ${origin} is not allowed by CORS.`));
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
app.use("/api/admin", adminRouter);

app.use((_request, response) => {
  response.status(404).json({ message: "Not found." });
});

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  console.error("[api]", error);
  response.status(500).json({ message: error.message || "Something went wrong on the server." });
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
