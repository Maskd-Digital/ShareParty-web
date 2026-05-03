import { NextResponse } from "next/server";
import { assertLibraryOperator } from "@/lib/authz";
import { FIXED_INTAKE_SHOTS } from "@/lib/intakePhotoChecklist";
import { fillIntakeFromPhotos } from "@/lib/openai/fillIntakeFromPhotos";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
/** OpenAI vision + web search can exceed default 10s on hobby tiers. */
export const maxDuration = 120;

type SessionPhoto = { shot_key: string; url: string; created_at: string };

/**
 * POST /api/ai/intake/fill-openai
 * Body: { intake_session_id: string }
 * Synchronously runs OpenAI (vision + web search), inserts ai_item_suggestions, returns the row.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { intake_session_id?: string };
  try {
    body = (await request.json()) as { intake_session_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const intakeSessionId = body.intake_session_id?.trim();
  if (!intakeSessionId) {
    return NextResponse.json({ error: "intake_session_id required" }, { status: 400 });
  }

  const { data: session, error: sessionErr } = await supabase
    .from("catalog_intake_sessions")
    .select("id, library_id, operator_user_id, toy_category")
    .eq("id", intakeSessionId)
    .maybeSingle();

  if (sessionErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.operator_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await assertLibraryOperator(supabase, user.id, session.library_id);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Forbidden" }, { status });
  }

  const { data: photoRows, error: photoErr } = await supabase
    .from("session_photos")
    .select("shot_key,url,created_at")
    .eq("session_type", "intake")
    .eq("intake_session_id", intakeSessionId)
    .order("created_at", { ascending: true });

  if (photoErr) {
    return NextResponse.json({ error: photoErr.message }, { status: 400 });
  }

  const photos = (photoRows ?? []) as SessionPhoto[];
  const firstUrlByShot: Record<string, string> = {};
  for (const p of photos) {
    if (!p.shot_key || !p.url) continue;
    if (firstUrlByShot[p.shot_key] === undefined) {
      firstUrlByShot[p.shot_key] = p.url;
    }
  }

  const orderedShots = [...FIXED_INTAKE_SHOTS].sort((a, b) => a.sort_order - b.sort_order);
  const toAnalyze: { shot_key: string; url: string }[] = [];
  for (const s of orderedShots) {
    if (!s.required) continue;
    const url = firstUrlByShot[s.shot_key];
    if (!url) {
      return NextResponse.json(
        { error: `missing_required_photo`, shot_key: s.shot_key, message: `Upload required photo: ${s.label}` },
        { status: 400 },
      );
    }
    toAnalyze.push({ shot_key: s.shot_key, url });
  }

  const toyCategory = typeof session.toy_category === "string" ? session.toy_category : "";

  let parsed: Awaited<ReturnType<typeof fillIntakeFromPhotos>>;
  try {
    parsed = await fillIntakeFromPhotos(supabase, toAnalyze, toyCategory);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "openai_failed", message }, { status: 502 });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("ai_item_suggestions")
    .insert({
      library_id: session.library_id,
      intake_session_id: intakeSessionId,
      job_run_id: null,
      suggested_fields: parsed.suggested_fields,
      confidence: parsed.confidence,
    })
    .select("id,suggested_fields,confidence")
    .single();

  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message ?? "Failed to save suggestion" }, { status: 400 });
  }

  const sf = inserted.suggested_fields as Record<string, unknown>;
  const warnings = Array.isArray(sf.ai_warnings)
    ? sf.ai_warnings.filter((w): w is string => typeof w === "string")
    : parsed.warnings;

  const sources = Array.isArray(sf.sources)
    ? sf.sources.filter((s): s is { title: string; url: string } => {
        return s !== null && typeof s === "object" && typeof (s as { url?: string }).url === "string";
      })
    : parsed.sources;

  return NextResponse.json({
    suggestion: {
      id: inserted.id,
      suggested_fields: inserted.suggested_fields,
      confidence: inserted.confidence,
      warnings,
      sources,
    },
  });
}
