import { NextResponse } from "next/server";
import { assertLibraryOperator } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { status?: "approved" | "rejected" };
  if (body.status !== "approved" && body.status !== "rejected") {
    return NextResponse.json({ error: "status must be approved or rejected" }, { status: 400 });
  }

  const { data: reqRow, error: reqErr } = await supabase
    .from("membership_requests")
    .select("id,user_id,library_id,status")
    .eq("id", id)
    .maybeSingle();

  if (reqErr || !reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (reqRow.status !== "pending") {
    return NextResponse.json({ error: "Request is no longer pending" }, { status: 400 });
  }

  try {
    await assertLibraryOperator(supabase, user.id, reqRow.library_id as string);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Forbidden" }, { status });
  }

  if (body.status === "rejected") {
    const { error } = await supabase
      .from("membership_requests")
      .update({
        status: "rejected",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const { data: lib, error: libErr } = await supabase
    .from("libraries")
    .select("requires_paid_membership,membership_fee_amount,stripe_account_id")
    .eq("id", reqRow.library_id)
    .maybeSingle();

  if (libErr || !lib) return NextResponse.json({ error: "Library not found" }, { status: 404 });

  if (lib.requires_paid_membership) {
    if (!lib.stripe_account_id) {
      return NextResponse.json({ error: "Library Stripe is not configured" }, { status: 400 });
    }
    if (!lib.membership_fee_amount || lib.membership_fee_amount <= 0) {
      return NextResponse.json({ error: "Library membership fee is not set" }, { status: 400 });
    }
  }

  const { data: existing } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", reqRow.user_id)
    .eq("library_id", reqRow.library_id)
    .maybeSingle();

  let membershipId = existing?.id as string | undefined;

  if (!membershipId) {
    const paymentStatus = lib.requires_paid_membership ? "pending" : "free";
    const { data: ins, error: insErr } = await supabase
      .from("memberships")
      .insert({
        user_id: reqRow.user_id,
        library_id: reqRow.library_id,
        status: "active",
        payment_status: paymentStatus,
        source: "shareparty",
      })
      .select("id")
      .single();

    if (insErr || !ins?.id) {
      return NextResponse.json({ error: insErr?.message ?? "Failed to create membership" }, { status: 400 });
    }
    membershipId = ins.id;
  }

  const { error: updErr } = await supabase
    .from("membership_requests")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    membershipId,
    paymentRequired: Boolean(lib.requires_paid_membership),
  });
}
