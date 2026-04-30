import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertLibraryOperator } from "@/lib/authz";

export const dynamic = "force-dynamic";

type MemberRow = {
  user_id: string;
  status: string;
  payment_status: string;
  created_at: string;
  membership_id: string | null;
  source: string;
  profile: {
    id: string;
    email: string | null;
    full_name: string | null;
    phone_number: string | null;
    created_at: string;
  } | null;
};

/**
 * GET /api/members?library_id=...&q=...
 * Lists members of a library (operator/owner only).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const libraryId = searchParams.get("library_id")?.trim();
  const q = searchParams.get("q")?.trim() ?? "";

  if (!libraryId) return NextResponse.json({ error: "library_id required" }, { status: 400 });

  try {
    await assertLibraryOperator(supabase, user.id, libraryId);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Forbidden" }, { status });
  }

  // memberships RLS now permits owner to select; profiles RLS permits owner to read member profiles.
  const { data: memberships, error: mErr } = await supabase
    .from("memberships")
    .select("user_id,status,payment_status,created_at,membership_id,source")
    .eq("library_id", libraryId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 });

  const userIds = Array.from(new Set((memberships ?? []).map((m) => m.user_id)));
  if (userIds.length === 0) return NextResponse.json({ members: [] });

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id,email,full_name,phone_number,created_at")
    .in("id", userIds);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const rows: MemberRow[] = (memberships ?? []).map((m) => ({
    ...(m as Omit<MemberRow, "profile">),
    profile: (byId.get(m.user_id) as MemberRow["profile"]) ?? null,
  }));

  const needle = q.toLowerCase();
  const filtered =
    needle.length === 0
      ? rows
      : rows.filter((r) => {
          const p = r.profile;
          const hay = [p?.full_name, p?.email, p?.phone_number, r.membership_id].filter(Boolean).join(" ").toLowerCase();
          return hay.includes(needle);
        });

  return NextResponse.json({ members: filtered });
}

