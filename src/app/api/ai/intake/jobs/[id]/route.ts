import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  status: string;
  error: string | null;
  output: unknown;
  model: string | null;
  latency_ms: number | null;
  intake_session_id: string | null;
  library_id: string;
};

/**
 * GET /api/ai/intake/jobs/[id] — job status for polling (operator must own the library).
 */
export async function GET(_request: Request, context: { params: { id: string } }) {
  const jobId = context.params.id;
  if (!jobId) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: job, error } = await supabase
    .from("ai_job_runs")
    .select("id,status,error,output,model,latency_ms,intake_session_id,library_id")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = job as Row;

  const { data: lib } = await supabase
    .from("libraries")
    .select("owner_user_id")
    .eq("id", row.library_id)
    .maybeSingle();

  if (!lib || lib.owner_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: row.id,
    status: row.status,
    error: row.error,
    output: row.output,
    model: row.model,
    latencyMs: row.latency_ms,
    intakeSessionId: row.intake_session_id,
    libraryId: row.library_id,
  });
}
