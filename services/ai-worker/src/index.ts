import express from "express";
import { runIntakeAutofill } from "./intakeAutofill.js";

const app = express();
app.use(express.json({ limit: "256kb" }));

function verifyWorkerAuth(req: express.Request): boolean {
  const secret = process.env.WORKER_SHARED_SECRET?.trim();
  if (!secret) return true;
  const auth = req.headers.authorization ?? "";
  const expected = `Bearer ${secret}`;
  return auth === expected;
}

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

/**
 * Cloud Tasks posts here with JSON body: { "job_run_id": "<uuid>" }
 * (Base64 body is decoded by Cloud Tasks before delivery.)
 */
app.post("/jobs/intake-autofill", async (req, res) => {
  if (!verifyWorkerAuth(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const jobRunId = (req.body as { job_run_id?: string })?.job_run_id?.trim();
  if (!jobRunId) {
    res.status(400).json({ error: "job_run_id required" });
    return;
  }

  try {
    const result = await runIntakeAutofill(jobRunId);
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("intake-autofill failed:", message);
    res.status(500).json({ ok: false, error: message });
  }
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`ai-worker listening on :${port}`);
});
