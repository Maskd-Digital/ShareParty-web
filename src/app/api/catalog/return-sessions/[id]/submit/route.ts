import { NextResponse } from "next/server";
import { FIXED_INTAKE_SHOTS } from "@/lib/intakePhotoChecklist";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/catalog/return-sessions/[id]/submit
 * Member marks return photos complete (requires three checklist photos).
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await ctx.params;
  if (!sessionId) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: s, error: sErr } = await supabase
    .from("return_inspection_sessions")
    .select("id,member_user_id,status")
    .eq("id", sessionId)
    .maybeSingle();

  if (sErr || !s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (s.member_user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (s.status !== "draft") return NextResponse.json({ error: "invalid_status" }, { status: 400 });

  const requiredKeys = FIXED_INTAKE_SHOTS.filter((x) => x.required).map((x) => x.shot_key);
  const { data: photos, error: pErr } = await supabase
    .from("session_photos")
    .select("shot_key")
    .eq("session_type", "return")
    .eq("return_session_id", sessionId);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

  const counts = new Map<string, number>();
  for (const row of photos ?? []) {
    if (row.shot_key) counts.set(row.shot_key, (counts.get(row.shot_key) ?? 0) + 1);
  }
  for (const key of requiredKeys) {
    if ((counts.get(key) ?? 0) < 1) {
      return NextResponse.json({ error: "missing_photos", missing: key }, { status: 400 });
    }
  }

  const { error: uErr } = await supabase
    .from("return_inspection_sessions")
    .update({ status: "submitted" })
    .eq("id", sessionId)
    .eq("member_user_id", user.id);

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
