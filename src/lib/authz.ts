import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertLibraryOperator(
  supabase: SupabaseClient,
  userId: string,
  libraryId: string,
): Promise<void> {
  // Owner-only operator model:
  // - library must be owned by this user
  // - user's profile must have role='operator'
  const { data: profileRow, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr || !profileRow || profileRow.role !== "operator") {
    const err = new Error("Forbidden");
    (err as Error & { status: number }).status = 403;
    throw err;
  }

  const { data: libraryRow, error: libraryErr } = await supabase
    .from("libraries")
    .select("owner_user_id")
    .eq("id", libraryId)
    .maybeSingle();

  if (libraryErr || !libraryRow || libraryRow.owner_user_id !== userId) {
    const err = new Error("Forbidden");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}
