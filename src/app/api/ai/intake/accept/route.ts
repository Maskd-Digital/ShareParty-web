import { NextResponse } from "next/server";
import { assertLibraryOperator } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Condition = "new" | "good" | "fair" | "poor";

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
}

function asInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
}

function pickCondition(v: unknown): Condition {
  const s = asString(v)?.toLowerCase();
  if (s === "new" || s === "good" || s === "fair" || s === "poor") return s;
  return "good";
}

/**
 * POST /api/ai/intake/accept
 * Creates library_items from AI suggestion + optional overrides; links intake session; marks suggestion accepted.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  type Body = {
    intake_session_id?: string;
    suggestion_id?: string;
    fields?: Record<string, unknown>;
  };

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const intakeSessionId = body.intake_session_id?.trim();
  if (!intakeSessionId) return NextResponse.json({ error: "intake_session_id required" }, { status: 400 });

  const { data: session, error: sErr } = await supabase
    .from("catalog_intake_sessions")
    .select("id,library_id,operator_user_id,item_id")
    .eq("id", intakeSessionId)
    .maybeSingle();

  if (sErr || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.operator_user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await assertLibraryOperator(supabase, user.id, session.library_id);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.item_id) {
    return NextResponse.json({ error: "session_already_linked", itemId: session.item_id }, { status: 409 });
  }

  type SuggestionRow = { id: string; suggested_fields: Record<string, unknown> };
  let suggestionRow: SuggestionRow | null = null;

  if (body.suggestion_id) {
    const { data: s } = await supabase
      .from("ai_item_suggestions")
      .select("id,suggested_fields")
      .eq("id", body.suggestion_id)
      .eq("intake_session_id", intakeSessionId)
      .maybeSingle();
    if (s) suggestionRow = s as SuggestionRow;
  } else {
    const { data: s } = await supabase
      .from("ai_item_suggestions")
      .select("id,suggested_fields")
      .eq("intake_session_id", intakeSessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (s) suggestionRow = s as SuggestionRow;
  }

  if (!suggestionRow) {
    return NextResponse.json({ error: "no_suggestion" }, { status: 400 });
  }

  const base = { ...suggestionRow.suggested_fields };
  delete base.ai_warnings;
  const overrides = body.fields ?? {};
  const merged: Record<string, unknown> = { ...base, ...overrides };
  delete merged.ai_warnings;

  const nameRaw = asString(merged.name);
  const name = nameRaw && nameRaw.length >= 1 ? nameRaw.slice(0, 200) : "Untitled toy";

  const { data: photos } = await supabase
    .from("session_photos")
    .select("shot_key,url")
    .eq("session_type", "intake")
    .eq("intake_session_id", intakeSessionId);

  const urls = (photos ?? []).map((p) => p.url).filter(Boolean);
  const imageUrl = urls[0] ?? null;

  const conditionScoreRaw = asInt(merged.condition_score);
  const condition_score =
    conditionScoreRaw != null && conditionScoreRaw >= 0 && conditionScoreRaw <= 100 ? conditionScoreRaw : null;

  const insertPayload = {
    library_id: session.library_id,
    name,
    description: asString(merged.description),
    category: asString(merged.category),
    brand: asString(merged.brand),
    age_min: asInt(merged.age_min),
    age_max: asInt(merged.age_max),
    piece_count: asInt(merged.piece_count),
    condition: pickCondition(merged.condition),
    condition_score,
    tags: asStringArray(merged.tags),
    skills: asStringArray(merged.skills),
    internal_ref: asString(merged.internal_ref),
    storage_location: asString(merged.storage_location),
    image_url: imageUrl,
    photo_urls: urls,
    availability_status: "available" as const,
    ai_status: "complete" as const,
  };

  const { data: item, error: insErr } = await supabase.from("library_items").insert(insertPayload).select("id").single();

  if (insErr || !item) return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 400 });

  const chosen = {
    ...merged,
    name,
    image_url: imageUrl,
    photo_urls: urls,
  };

  await supabase
    .from("ai_item_suggestions")
    .update({ chosen_fields: chosen, accepted_at: new Date().toISOString() })
    .eq("id", suggestionRow.id);

  await supabase
    .from("catalog_intake_sessions")
    .update({ item_id: item.id, status: "complete" })
    .eq("id", intakeSessionId);

  return NextResponse.json({ ok: true, itemId: item.id });
}
