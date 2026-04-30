/**
 * Enqueues a Cloud Tasks HTTP task that invokes the Cloud Run AI worker (Vertex Gemini pipeline).
 * Requires GCP credentials at runtime (GOOGLE_APPLICATION_CREDENTIALS or default ADC).
 *
 * Env (all optional — if any required piece is missing, enqueue is skipped):
 * - GCP_PROJECT_ID (or GOOGLE_CLOUD_PROJECT)
 * - GCP_LOCATION — Cloud Tasks queue region, e.g. us-central1
 * - CLOUD_TASKS_QUEUE_ID — queue id
 * - AI_WORKER_INTAKE_URL — POST target (Cloud Run), e.g. https://ai-worker-xxxxx.run.app/jobs/intake-autofill
 * - CLOUD_TASKS_OIDC_SA — service account email for OIDC token when calling private Cloud Run
 * - WORKER_SHARED_SECRET (optional) — if set, adds Authorization: Bearer for the Cloud Run worker
 */

export type EnqueueResult = { enqueued: boolean; taskName?: string; skippedReason?: string; error?: string };

export async function enqueueIntakeAutofillTask(jobRunId: string): Promise<EnqueueResult> {
  const project =
    process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "";
  const location = process.env.GCP_LOCATION ?? process.env.CLOUD_TASKS_LOCATION ?? "";
  const queueId = process.env.CLOUD_TASKS_QUEUE_ID ?? "";
  const url = process.env.AI_WORKER_INTAKE_URL ?? "";
  const oidcSa = process.env.CLOUD_TASKS_OIDC_SA ?? "";
  const workerSecret = process.env.WORKER_SHARED_SECRET?.trim();

  if (!project || !location || !queueId || !url) {
    return {
      enqueued: false,
      skippedReason:
        "Cloud Tasks not configured (set GCP_PROJECT_ID, GCP_LOCATION, CLOUD_TASKS_QUEUE_ID, AI_WORKER_INTAKE_URL)",
    };
  }

  try {
    const { CloudTasksClient } = await import("@google-cloud/tasks");
    const client = new CloudTasksClient();
    const parent = client.queuePath(project, location, queueId);

    const body = Buffer.from(JSON.stringify({ job_run_id: jobRunId })).toString("base64");

    const httpRequest: {
      httpMethod: "POST";
      url: string;
      headers: Record<string, string>;
      body: string;
      oidcToken?: { serviceAccountEmail: string };
    } = {
      httpMethod: "POST",
      url,
      headers: { "Content-Type": "application/json" },
      body,
    };

    if (workerSecret) {
      httpRequest.headers.Authorization = `Bearer ${workerSecret}`;
    }

    if (oidcSa) {
      httpRequest.oidcToken = { serviceAccountEmail: oidcSa };
    }

    const [response] = await client.createTask({
      parent,
      task: { httpRequest },
    });

    const taskName = response.name ?? undefined;
    return { enqueued: true, taskName };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { enqueued: false, error: message };
  }
}
