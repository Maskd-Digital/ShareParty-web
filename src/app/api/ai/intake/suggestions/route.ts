import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/intake/suggestions?intake_session_id= — latest AI suggestion for the session.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const intakeSessionId = searchParams.get("intake_session_id")?.trim();
  if (!intakeSessionId) return NextResponse.json({ error: "intake_session_id required" }, { status: 400 });

  const { data: session, error: sErr } = await supabase
    .from("catalog_intake_sessions")
    .select("id,library_id,operator_user_id")
    .eq("id", intakeSessionId)
    .maybeSingle();

  if (sErr || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.operator_user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: latest, error } = await supabase
    .from("ai_item_suggestions")
    .select("id,suggested_fields,confidence,chosen_fields,accepted_at,created_at,job_run_id")
    .eq("intake_session_id", intakeSessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ suggestion: latest });
}
