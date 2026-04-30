import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertLibraryOperator } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * POST /api/members/onboard
 * Body: { library_id: string, email?: string, user_id?: string, full_name?: string }
 *
 * Creates a memberships row for an existing profile (operator/owner only).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    library_id?: string;
    email?: string;
    user_id?: string;
    full_name?: string;
  };

  const libraryId = body.library_id?.trim();
  if (!libraryId) return NextResponse.json({ error: "library_id required" }, { status: 400 });

  try {
    await assertLibraryOperator(supabase, user.id, libraryId);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Forbidden" }, { status });
  }

  let targetUserId: string | null = body.user_id?.trim() || null;

  if (!targetUserId) {
    const email = body.email?.trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Provide user_id or email" }, { status: 400 });

    const { data: profile, error } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!profile?.id) return NextResponse.json({ error: "No user found with that email" }, { status: 404 });
    targetUserId = profile.id;
  }

  // Ensure the member profile exists (RLS policy will allow this select now for library owner only if already member,
  // but we are onboarding. Use a lightweight existence check by id, which will pass if profile_select_own does not allow.
  // So we avoid selecting profile data; we just attempt insert and surface errors.

  const { data: existing } = await supabase
    .from("memberships")
    .select("id")
    .eq("library_id", libraryId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (existing?.id) return NextResponse.json({ ok: true, membershipId: existing.id, already: true });

  const { data: inserted, error: insErr } = await supabase
    .from("memberships")
    .insert({
      library_id: libraryId,
      user_id: targetUserId,
      status: "active",
      payment_status: "free",
      source: "shareparty",
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) return NextResponse.json({ error: insErr?.message ?? "Failed" }, { status: 400 });

  // Optional: set member full_name if provided and currently empty.
  const fullName = body.full_name?.trim();
  if (fullName) {
    await supabase.from("profiles").update({ full_name: fullName.slice(0, 100) }).eq("id", targetUserId);
  }

  return NextResponse.json({ ok: true, membershipId: inserted.id, already: false });
}

