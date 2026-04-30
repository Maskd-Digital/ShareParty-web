import { NextResponse } from "next/server";
import { assertLibraryOperator } from "@/lib/authz";
import { enqueueIntakeAutofillTask } from "@/lib/google-cloud-tasks/enqueueIntakeAutofill";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/intake/start
 * Body: { intake_session_id: string }
 * Creates ai_job_runs (queued) and enqueues Cloud Tasks -> Cloud Run worker when configured.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { intake_session_id?: string };
  try {
    body = (await request.json()) as { intake_session_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const intakeSessionId = body.intake_session_id?.trim();
  if (!intakeSessionId) {
    return NextResponse.json({ error: "intake_session_id required" }, { status: 400 });
  }

  const { data: session, error: sessionErr } = await supabase
    .from("catalog_intake_sessions")
    .select("id, library_id, operator_user_id")
    .eq("id", intakeSessionId)
    .maybeSingle();

  if (sessionErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.operator_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await assertLibraryOperator(supabase, user.id, session.library_id);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Forbidden" }, { status });
  }

  const inputPayload = {
    intake_session_id: intakeSessionId,
    library_id: session.library_id,
  };

  const { data: job, error: insertErr } = await supabase
    .from("ai_job_runs")
    .insert({
      job_type: "intake_autofill",
      library_id: session.library_id,
      created_by_user_id: user.id,
      intake_session_id: intakeSessionId,
      status: "queued",
      input: inputPayload,
      provider: "vertex_gemini",
    })
    .select("id, status, created_at")
    .single();

  if (insertErr || !job) {
    return NextResponse.json({ error: insertErr?.message ?? "Failed to create job" }, { status: 400 });
  }

  const enqueue = await enqueueIntakeAutofillTask(job.id);

  // Misconfiguration / API failure: record failure only when Tasks was invoked and errored.
  if (!enqueue.enqueued && enqueue.error) {
    await supabase
      .from("ai_job_runs")
      .update({
        status: "failed",
        error: `cloud_tasks_enqueue: ${enqueue.error}`,
      })
      .eq("id", job.id);

    return NextResponse.json(
      {
        error: "enqueue_failed",
        message: enqueue.error,
        jobRunId: job.id,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    jobRunId: job.id,
    status: job.status,
    createdAt: job.created_at,
    tasksEnqueued: enqueue.enqueued,
    ...(enqueue.skippedReason ? { tasksSkippedReason: enqueue.skippedReason } : {}),
    ...(enqueue.taskName ? { cloudTaskName: enqueue.taskName } : {}),
  });
}
