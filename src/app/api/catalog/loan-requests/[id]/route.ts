import { NextResponse } from "next/server";
import { assertLibraryOperator } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    status?: "approved" | "declined" | "cancelled";
    operator_note?: string | null;
  };

  const { data: reqRow, error: reqErr } = await supabase
    .from("loan_requests")
    .select("id,library_id,item_id,member_user_id,status")
    .eq("id", id)
    .maybeSingle();

  if (reqErr || !reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  if (body.status === "cancelled") {
    if (reqRow.member_user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (reqRow.status !== "pending") {
      return NextResponse.json({ error: "Cannot cancel this request" }, { status: 400 });
    }
    const { error } = await supabase.from("loan_requests").update({ status: "cancelled" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.status !== "approved" && body.status !== "declined") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    await assertLibraryOperator(supabase, user.id, reqRow.library_id as string);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Forbidden" }, { status });
  }

  if (reqRow.status !== "pending") {
    return NextResponse.json({ error: "Request is no longer pending" }, { status: 400 });
  }

  if (body.status === "declined") {
    const { error } = await supabase
      .from("loan_requests")
      .update({
        status: "declined",
        operator_note: body.operator_note?.trim() || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const { data: item, error: itemErr } = await supabase
    .from("library_items")
    .select("availability_status")
    .eq("id", reqRow.item_id)
    .maybeSingle();

  if (itemErr || !item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (item.availability_status !== "available") {
    return NextResponse.json({ error: "Item is no longer available" }, { status: 409 });
  }

  const { data: lib } = await supabase
    .from("libraries")
    .select("loan_period_days")
    .eq("id", reqRow.library_id)
    .maybeSingle();

  const days = lib?.loan_period_days ?? 14;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + days);

  const admin = createAdminClient();
  const { data: loan, error: loanErr } = await admin
    .from("loans")
    .insert({
      library_id: reqRow.library_id,
      item_id: reqRow.item_id,
      member_user_id: reqRow.member_user_id,
      issued_by: user.id,
      status: "active",
      due_date: dueDate.toISOString(),
    })
    .select("id")
    .single();

  if (loanErr || !loan?.id) {
    return NextResponse.json({ error: loanErr?.message ?? "Failed to create loan" }, { status: 400 });
  }

  await admin.from("library_items").update({ availability_status: "on_loan" }).eq("id", reqRow.item_id);

  const { error: updErr } = await supabase
    .from("loan_requests")
    .update({
      status: "approved",
      loan_id: loan.id,
      operator_note: body.operator_note?.trim() || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, loanId: loan.id });
}
