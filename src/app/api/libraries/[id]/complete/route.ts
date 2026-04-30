import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertLibraryOperator } from "@/lib/authz";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: libraryId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await assertLibraryOperator(supabase, user.id, libraryId);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Forbidden" }, { status });
  }

  const { data: lib, error: fetchErr } = await supabase
    .from("libraries")
    .select("requires_paid_membership, stripe_account_id")
    .eq("id", libraryId)
    .single();

  if (fetchErr || !lib) {
    return NextResponse.json({ error: "Library not found" }, { status: 404 });
  }

  if (lib.requires_paid_membership && !lib.stripe_account_id) {
    return NextResponse.json({ error: "Stripe account onboarding required" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
