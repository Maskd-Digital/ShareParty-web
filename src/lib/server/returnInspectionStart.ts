import type { SupabaseClient } from "@supabase/supabase-js";
import { assertLibraryMember } from "@/lib/authz";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type StartReturnResult =
  | { ok: true; sessionId: string; existing: boolean }
  | { ok: false; status: number; error: string };

export async function startReturnInspection(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
): Promise<StartReturnResult> {
  const { data: item, error: itemErr } = await supabase
    .from("library_items")
    .select("id,library_id,availability_status")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr || !item) return { ok: false, status: 404, error: "Item not found" };

  try {
    await assertLibraryMember(supabase, userId, item.library_id);
  } catch {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  if (item.availability_status !== "on_loan") {
    return { ok: false, status: 400, error: "item_not_on_loan" };
  }

  const { data: loan } = await supabase
    .from("loans")
    .select("id")
    .eq("item_id", itemId)
    .eq("member_user_id", userId)
    .in("status", ["active", "overdue"])
    .maybeSingle();

  if (!loan) return { ok: false, status: 400, error: "no_active_loan" };

  const { data: existing } = await supabase
    .from("return_inspection_sessions")
    .select("id,status,member_user_id")
    .eq("item_id", itemId)
    .in("status", ["draft", "submitted"])
    .maybeSingle();

  if (existing) {
    if (existing.status === "submitted") {
      return { ok: false, status: 409, error: "return_already_pending_review" };
    }
    if (existing.member_user_id !== userId) {
      return { ok: false, status: 409, error: "return_session_conflict" };
    }
    return { ok: true, sessionId: existing.id, existing: true };
  }

  const { data: created, error: insErr } = await supabase
    .from("return_inspection_sessions")
    .insert({
      library_id: item.library_id,
      member_user_id: userId,
      item_id: item.id,
      status: "draft",
    })
    .select("id")
    .single();

  if (insErr || !created) {
    return { ok: false, status: 400, error: insErr?.message ?? "Insert failed" };
  }

  try {
    const admin = await createServiceRoleClient();
    const { error: upErr } = await admin
      .from("library_items")
      .update({ availability_status: "under_inspection" })
      .eq("id", item.id)
      .eq("availability_status", "on_loan");
    if (upErr) {
      await supabase.from("return_inspection_sessions").delete().eq("id", created.id);
      return { ok: false, status: 400, error: upErr.message };
    }
  } catch (e) {
    await supabase.from("return_inspection_sessions").delete().eq("id", created.id);
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : "Could not update item availability",
    };
  }

  return { ok: true, sessionId: created.id, existing: false };
}
