import type { SupabaseClient } from "@supabase/supabase-js";

export async function validateLoanRequest(
  supabase: SupabaseClient,
  userId: string,
  libraryId: string,
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data: item, error: itemErr } = await supabase
    .from("library_items")
    .select("id,availability_status,library_id")
    .eq("id", itemId)
    .eq("library_id", libraryId)
    .maybeSingle();

  if (itemErr || !item) return { ok: false, error: "Item not found", status: 404 };
  if (item.availability_status !== "available") {
    return { ok: false, error: "Item is not available", status: 400 };
  }

  const { data: lib } = await supabase
    .from("libraries")
    .select("max_items_per_member")
    .eq("id", libraryId)
    .maybeSingle();

  const maxItems = lib?.max_items_per_member ?? 3;

  const { count: activeLoanCount } = await supabase
    .from("loans")
    .select("*", { count: "exact", head: true })
    .eq("member_user_id", userId)
    .eq("library_id", libraryId)
    .in("status", ["active", "overdue", "return_pending", "reserved"]);

  if ((activeLoanCount ?? 0) >= maxItems) {
    return { ok: false, error: "Borrow limit reached", status: 400 };
  }

  const { data: existingReq } = await supabase
    .from("loan_requests")
    .select("id")
    .eq("member_user_id", userId)
    .eq("item_id", itemId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingReq?.id) {
    return { ok: false, error: "You already have a pending request for this item", status: 400 };
  }

  return { ok: true };
}
