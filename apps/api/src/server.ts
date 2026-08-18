import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { env, storageMode } from "./lib/env";
import { adminRouter } from "./routes/admin";
import { catalogRouter } from "./routes/catalog";
import { testsRouter } from "./routes/tests";

const app = express();

app.use(cors({ origin: env.webOrigin }));

// Question diagrams arrive base64 encoded in the JSON body, so the default
// 100kb limit is far too small.
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_request, response) => {
  response.json({ status: "ok", storageMode });
});

app.use("/api/catalog", catalogRouter);
app.use("/api/tests", testsRouter);
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

  if (env.adminPasswordIsDefault) {
    console.warn(
      `[api] ADMIN_PASSWORD is not set, so the admin dashboard is using the default password "${env.adminPassword}". Set your own in .env.`
    );
  }
});
