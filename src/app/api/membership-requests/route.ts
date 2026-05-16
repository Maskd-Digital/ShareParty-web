import { NextResponse } from "next/server";
import { assertLibraryOperator } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const libraryId = new URL(request.url).searchParams.get("library_id")?.trim();
  const statusFilter = new URL(request.url).searchParams.get("status")?.trim() ?? "pending";

  if (libraryId) {
    try {
      await assertLibraryOperator(supabase, user.id, libraryId);
    } catch (e) {
      const status = (e as Error & { status?: number }).status ?? 403;
      return NextResponse.json({ error: "Forbidden" }, { status });
    }

    const { data, error } = await supabase
      .from("membership_requests")
      .select("id,user_id,library_id,status,phone_number,address,note,created_at")
      .eq("library_id", libraryId)
      .eq("status", statusFilter)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const userIds = Array.from(new Set((data ?? []).map((r) => r.user_id as string)));
    let profiles = new Map<string, { email: string | null; full_name: string | null }>();
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,email,full_name")
        .in("id", userIds);
      profiles = new Map(
        (profs ?? []).map((p) => [p.id as string, { email: p.email as string | null, full_name: p.full_name as string | null }]),
      );
    }

    return NextResponse.json({
      requests: (data ?? []).map((r) => ({
        ...r,
        profile: profiles.get(r.user_id as string) ?? null,
      })),
    });
  }

  const { data, error } = await supabase
    .from("membership_requests")
    .select("id,library_id,status,phone_number,address,note,created_at,reviewed_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const libraryIds = Array.from(new Set((data ?? []).map((r) => r.library_id as string)));
  const libraryNames = new Map<string, string>();

  if (libraryIds.length) {
    const cards = await Promise.all(
      libraryIds.map((id) => supabase.rpc("get_library_join_card", { p_library_id: id })),
    );
    libraryIds.forEach((id, i) => {
      const row = Array.isArray(cards[i].data) ? cards[i].data?.[0] : cards[i].data;
      if (row?.library_name) libraryNames.set(id, row.library_name as string);
    });
  }

  const requests = (data ?? []).map((r) => ({
    ...r,
    library_name: libraryNames.get(r.library_id as string) ?? null,
  }));

  return NextResponse.json({ requests });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    library_id?: string;
    phone_number?: string | null;
    address?: string | null;
    note?: string | null;
  };

  const libraryId = body.library_id?.trim();
  if (!libraryId) return NextResponse.json({ error: "library_id required" }, { status: 400 });

  const { data: cardRows, error: cardErr } = await supabase.rpc("get_library_join_card", {
    p_library_id: libraryId,
  });
  if (cardErr) return NextResponse.json({ error: cardErr.message }, { status: 400 });
  const card = Array.isArray(cardRows) ? cardRows[0] : cardRows;
  if (!card) return NextResponse.json({ error: "Library not found or inactive" }, { status: 404 });

  const { data: existingMember } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("library_id", libraryId)
    .maybeSingle();

  if (existingMember?.id) {
    return NextResponse.json({ error: "Already a member of this library" }, { status: 400 });
  }

  const { data: pending } = await supabase
    .from("membership_requests")
    .select("id")
    .eq("user_id", user.id)
    .eq("library_id", libraryId)
    .eq("status", "pending")
    .maybeSingle();

  if (pending?.id) {
    return NextResponse.json({ error: "A pending request already exists" }, { status: 400 });
  }

  const { data: inserted, error } = await supabase
    .from("membership_requests")
    .insert({
      user_id: user.id,
      library_id: libraryId,
      phone_number: body.phone_number?.trim() || null,
      address: body.address?.trim() || null,
      note: body.note?.trim() || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ id: inserted.id, library: card });
}
