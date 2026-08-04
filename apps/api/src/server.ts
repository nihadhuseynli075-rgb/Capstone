import cors from "cors";
import "dotenv/config";
import express from "express";
import { testsRouter } from "./routes/tests";

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173"
  })
);
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use("/api/tests", testsRouter);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
