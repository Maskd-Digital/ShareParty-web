import { NextResponse } from "next/server";
import { assertLibraryOperator } from "@/lib/authz";
import { FIXED_INTAKE_SHOTS } from "@/lib/intakePhotoChecklist";
import { analyzeReturnPhotos } from "@/lib/openai/analyzeReturnPhotos";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/return/analyze
 * body: { return_session_id, mode?: "with_user_uploads" | "with_spot" | "with_catalog" | "with_operator" }
 * - with_user_uploads (default; alias with_catalog): user-uploaded return photos (return bucket) vs catalog intake
 * - with_spot (alias with_operator): user-uploaded returns vs operator on-the-spot photo only (operator_addendum required)
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { return_session_id?: string; mode?: string };
  try {
    body = (await request.json()) as { return_session_id?: string; mode?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = body.return_session_id?.trim();
  if (!sessionId) return NextResponse.json({ error: "return_session_id required" }, { status: 400 });

  const rawMode = body.mode?.trim();
  const mode =
    rawMode === "with_spot" || rawMode === "with_operator"
      ? "with_spot"
      : "with_user_uploads"; /* default + legacy with_catalog */

  const { data: s, error: sErr } = await supabase
    .from("return_inspection_sessions")
    .select("id,library_id,item_id,status")
    .eq("id", sessionId)
    .maybeSingle();

  if (sErr || !s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (s.status !== "submitted") return NextResponse.json({ error: "invalid_status" }, { status: 400 });

  try {
    await assertLibraryOperator(supabase, user.id, s.library_id);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: item, error: iErr } = await supabase
    .from("library_items")
    .select("image_url,photo_urls")
    .eq("id", s.item_id)
    .maybeSingle();

  if (iErr || !item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const { data: photos, error: pErr } = await supabase
    .from("session_photos")
    .select("shot_key,url")
    .eq("session_type", "return")
    .eq("return_session_id", sessionId)
    .order("created_at", { ascending: true });

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

  const returnRows = (photos ?? []).filter((r) => r.shot_key !== "operator_addendum");
  const operatorRow = (photos ?? []).find((r) => r.shot_key === "operator_addendum");

  const requiredReturnKeys = FIXED_INTAKE_SHOTS.filter((s) => s.required).map((s) => s.shot_key);
  for (const key of requiredReturnKeys) {
    if (!returnRows.some((r) => r.shot_key === key)) {
      return NextResponse.json({ error: "missing_return_photos", missing: key }, { status: 400 });
    }
  }

  const catalogPaths: string[] = [];
  const pushPath = (p: string | null | undefined) => {
    if (!p || typeof p !== "string") return;
    const t = p.trim();
    if (!t || t.startsWith("http://") || t.startsWith("https://")) return;
    if (!catalogPaths.includes(t)) catalogPaths.push(t);
  };
  pushPath(item.image_url);
  const arr = item.photo_urls;
  if (Array.isArray(arr)) {
    for (const u of arr) pushPath(typeof u === "string" ? u : null);
  }

  if (mode === "with_user_uploads" && catalogPaths.length === 0) {
    return NextResponse.json({ error: "no_catalog_photos" }, { status: 400 });
  }

  let operatorAddendumPath: string | null = null;
  if (mode === "with_spot") {
    if (!operatorRow?.url) {
      return NextResponse.json({ error: "operator_spot_photo_required" }, { status: 400 });
    }
    operatorAddendumPath = operatorRow.url;
  }

  try {
    const analysis = await analyzeReturnPhotos(supabase, {
      returnPhotos: returnRows.map((r) => ({ shot_key: r.shot_key, url: r.url })),
      catalogPaths: mode === "with_user_uploads" ? catalogPaths : [],
      operatorAddendumPath,
      compareToCatalog: mode === "with_user_uploads",
    });

    const findings = {
      summary: analysis.summary,
      wear_notes: analysis.wear_notes,
      compared_to_catalog: analysis.compared_to_catalog,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("ai_return_reports")
      .insert({
        library_id: s.library_id,
        return_session_id: sessionId,
        condition_score: analysis.condition_score,
        condition_label: analysis.condition_label,
        findings,
        confidence: {},
        needs_manual_review: analysis.needs_manual_review,
      })
      .select("id,created_at")
      .single();

    if (insErr || !inserted) {
      return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, report: { id: inserted.id, ...analysis } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
