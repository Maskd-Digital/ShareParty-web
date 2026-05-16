import { NextResponse } from "next/server";
import { assertCatalogAccess, assertLibraryOperator } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { validateLoanRequest } from "@/lib/server/loanRequestRules";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const libraryId = new URL(request.url).searchParams.get("library_id")?.trim();
  if (!libraryId) return NextResponse.json({ error: "library_id required" }, { status: 400 });

  const operatorView = new URL(request.url).searchParams.get("operator") === "1";

  if (operatorView) {
    try {
      await assertLibraryOperator(supabase, user.id, libraryId);
    } catch (e) {
      const status = (e as Error & { status?: number }).status ?? 403;
      return NextResponse.json({ error: "Forbidden" }, { status });
    }

    const statusFilter = new URL(request.url).searchParams.get("status")?.trim() ?? "pending";
    const { data, error } = await supabase
      .from("loan_requests")
      .select("id,item_id,member_user_id,status,member_note,requested_at")
      .eq("library_id", libraryId)
      .eq("status", statusFilter)
      .order("requested_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const itemIds = Array.from(new Set((data ?? []).map((r) => r.item_id as string)));
    const memberIds = Array.from(new Set((data ?? []).map((r) => r.member_user_id as string)));
    let itemNames = new Map<string, string>();
    let memberProfiles = new Map<string, { email: string | null; full_name: string | null }>();

    if (itemIds.length) {
      const { data: items } = await supabase.from("library_items").select("id,name").in("id", itemIds);
      itemNames = new Map((items ?? []).map((i) => [i.id as string, i.name as string]));
    }
    if (memberIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id,email,full_name").in("id", memberIds);
      memberProfiles = new Map(
        (profs ?? []).map((p) => [p.id as string, { email: p.email as string | null, full_name: p.full_name as string | null }]),
      );
    }

    return NextResponse.json({
      requests: (data ?? []).map((r) => ({
        ...r,
        item_name: itemNames.get(r.item_id as string) ?? null,
        profile: memberProfiles.get(r.member_user_id as string) ?? null,
      })),
    });
  }

  try {
    await assertCatalogAccess(supabase, user.id, libraryId);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: status === 402 ? "Payment required" : "Forbidden" }, { status });
  }

  const { data, error } = await supabase
    .from("loan_requests")
    .select("id,item_id,status,member_note,operator_note,requested_at,reviewed_at")
    .eq("member_user_id", user.id)
    .eq("library_id", libraryId)
    .order("requested_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const itemIds = Array.from(new Set((data ?? []).map((r) => r.item_id as string)));
  let names = new Map<string, string>();
  if (itemIds.length) {
    const { data: items } = await supabase.from("library_items").select("id,name").in("id", itemIds);
    names = new Map((items ?? []).map((i) => [i.id as string, i.name as string]));
  }

  return NextResponse.json({
    requests: (data ?? []).map((r) => ({
      ...r,
      item_name: names.get(r.item_id as string) ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    library_id?: string;
    item_id?: string;
    member_note?: string | null;
  };

  const libraryId = body.library_id?.trim();
  const itemId = body.item_id?.trim();
  if (!libraryId || !itemId) {
    return NextResponse.json({ error: "library_id and item_id required" }, { status: 400 });
  }

  try {
    await assertCatalogAccess(supabase, user.id, libraryId);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: status === 402 ? "Payment required" : "Forbidden" }, { status });
  }

  const validation = await validateLoanRequest(supabase, user.id, libraryId, itemId);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const { data, error } = await supabase
    .from("loan_requests")
    .insert({
      library_id: libraryId,
      item_id: itemId,
      member_user_id: user.id,
      member_note: body.member_note?.trim() || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ id: data.id });
}
