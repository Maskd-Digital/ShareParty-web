import { NextResponse } from "next/server";
import { assertLibraryOperator } from "@/lib/authz";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Outcome = "approved" | "damaged";

/**
 * POST /api/catalog/return-sessions/[id]/resolve
 * Operator approves the return or flags damage; item returns to the shelf.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await ctx.params;
  if (!sessionId) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { outcome?: string; notes?: string };
  try {
    body = (await request.json()) as { outcome?: string; notes?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const outcome = body.outcome?.trim() as Outcome | undefined;
  if (outcome !== "approved" && outcome !== "damaged") {
    return NextResponse.json({ error: "outcome must be approved or damaged" }, { status: 400 });
  }

  const { data: s, error: sErr } = await supabase
    .from("return_inspection_sessions")
    .select("id,library_id,item_id,member_user_id,status")
    .eq("id", sessionId)
    .maybeSingle();

  if (sErr || !s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (s.status !== "submitted") return NextResponse.json({ error: "invalid_status" }, { status: 400 });

  try {
    await assertLibraryOperator(supabase, user.id, s.library_id);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim().slice(0, 2000)
      : outcome === "damaged"
        ? "Return flagged as damaged by operator."
        : null;

  const itemPatch =
    outcome === "damaged"
      ? {
          availability_status: "available" as const,
          condition: "poor" as const,
          condition_score: 20,
        }
      : { availability_status: "available" as const };

  const { error: itemErr } = await supabase.from("library_items").update(itemPatch).eq("id", s.item_id);
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 400 });

  const { error: sessErr } = await supabase
    .from("return_inspection_sessions")
    .update({
      status: "complete",
      review_outcome: outcome,
      operator_user_id: user.id,
      notes,
    })
    .eq("id", sessionId);

  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 400 });

  try {
    const admin = await createServiceRoleClient();
    await admin
      .from("loans")
      .update({ status: "returned", returned_at: new Date().toISOString() })
      .eq("library_id", s.library_id)
      .eq("item_id", s.item_id)
      .eq("member_user_id", s.member_user_id)
      .in("status", ["active", "overdue"]);
  } catch {
    /* loan row may be missing in dev; session + item already updated */
  }

  return NextResponse.json({ ok: true });
}
