"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  INTAKE_CATEGORIES,
  type DraftFields,
  clampScoreStr,
  conditionFromScore,
  draftFromSuggestion,
  draftToFieldsPayload,
  emptyDraft,
  isCategoryId,
  midpointScoreForCondition,
} from "../../formShared";

export default function IntakeDetailsPage() {
  const params = useParams();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";

  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionToyCategory, setSessionToyCategory] = useState<string>("");
  const [itemId, setItemId] = useState<string | null>(null);

  const [fillAiLoading, setFillAiLoading] = useState(false);
  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const [suggestionConfidence, setSuggestionConfidence] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<DraftFields>(() => emptyDraft());
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [acceptedItemId, setAcceptedItemId] = useState<string | null>(null);
  const [fillWarnings, setFillWarnings] = useState<string[]>([]);
  const [fillSources, setFillSources] = useState<{ title: string; url: string }[]>([]);
  const [aiSuggestedScore, setAiSuggestedScore] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setFatalError("Missing session");
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const { data: row, error: qErr } = await supabase
        .from("catalog_intake_sessions")
        .select("id,toy_category,item_id")
        .eq("id", sessionId)
        .maybeSingle();

      if (cancelled) return;
      if (qErr || !row) {
        setFatalError("Session not found or you do not have access.");
        setLoading(false);
        return;
      }

      if (row.item_id) {
        setItemId(row.item_id as string);
        setLoading(false);
        return;
      }

      const tc = typeof row.toy_category === "string" ? row.toy_category : "";
      setSessionToyCategory(tc);
      setDraft({ ...emptyDraft(), category: isCategoryId(tc) ? tc : "" });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function fillWithAi() {
    if (!sessionId || fillAiLoading) return;
    setError(null);
    setFillAiLoading(true);
    setFillWarnings([]);
    setFillSources([]);
    try {
      const res = await fetch("/api/ai/intake/fill-openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intake_session_id: sessionId }),
      });
      const j = (await res.json()) as {
        error?: string;
        message?: string;
        suggestion?: {
          id: string;
          suggested_fields: Record<string, unknown>;
          confidence: Record<string, unknown>;
          warnings?: string[];
          sources?: { title: string; url: string }[];
        };
      };
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Fill with AI failed");
      const s = j.suggestion;
      if (!s?.id || !s.suggested_fields) throw new Error("Invalid response from Fill with AI");
      setSuggestionId(s.id);
      setSuggestionConfidence(s.confidence ?? {});
      setDraft(draftFromSuggestion(s.suggested_fields));
      const cs = s.suggested_fields.condition_score;
      const n = typeof cs === "number" ? cs : parseInt(String(cs), 10);
      setAiSuggestedScore(Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null);
      setFillWarnings(Array.isArray(s.warnings) ? s.warnings : []);
      setFillSources(Array.isArray(s.sources) ? s.sources : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setFillAiLoading(false);
    }
  }

  async function acceptSuggestion() {
    if (!sessionId || !suggestionId || acceptLoading) return;
    setError(null);
    setAcceptLoading(true);
    try {
      const res = await fetch("/api/ai/intake/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intake_session_id: sessionId,
          suggestion_id: suggestionId,
          fields: draftToFieldsPayload(draft),
        }),
      });
      const j = (await res.json()) as { error?: string; itemId?: string };
      if (!res.ok) throw new Error(j.error ?? "Could not save catalog item");
      setAcceptedItemId(j.itemId ?? null);
      setSuggestionId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setAcceptLoading(false);
    }
  }

  const scoreSafe = useMemo(() => {
    const n = parseInt(draft.condition_score, 10);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 65;
  }, [draft.condition_score]);

  const photosHref = `/catalog/intake?session=${encodeURIComponent(sessionId)}`;

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center text-sm text-forest-700">Loading session…</div>
    );
  }

  if (fatalError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <p className="text-sm font-medium text-red-700">{fatalError}</p>
        <Link href="/catalog/intake" className="mt-4 inline-block text-sm font-semibold text-forest-700 underline">
          Start intake
        </Link>
      </div>
    );
  }

  if (itemId) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
        <p className="text-sm text-forest-800">This intake session is already linked to a catalog item.</p>
        <p className="mt-2 font-mono text-xs text-forest-700">Item id: {itemId}</p>
        <Link href="/catalog" className="mt-4 inline-block text-sm font-semibold text-forest-700 underline">
          Back to catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-700/80">Manage catalog</p>
          <h1 className="text-2xl font-bold text-forest-900">Toy details</h1>
          <p className="mt-1 text-xs text-forest-700/75">Session {sessionId.slice(0, 8)}…</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={photosHref} className="text-sm font-semibold text-forest-700 underline decoration-forest-600/30 underline-offset-2">
            Back to photos
          </Link>
          <Link href="/catalog" className="text-sm font-semibold text-forest-700 underline decoration-forest-600/30 underline-offset-2">
            Catalog
          </Link>
        </div>
      </div>

      {error ? <p className="mb-4 text-sm font-medium text-red-700">{error}</p> : null}

      {acceptedItemId ? (
        <div className="rounded-xl border border-green-200 bg-green-50/90 p-4 text-sm text-forest-900">
          <p className="font-semibold">Saved to catalog.</p>
          <p className="mt-1 font-mono text-xs text-forest-700">Item id: {acceptedItemId}</p>
          <Link href="/catalog" className="mt-2 inline-block text-sm font-semibold text-forest-700 underline">
            Back to catalog
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-cream-300/80 bg-cream-50/90 p-6 shadow-card sm:p-8">
          <div className="rounded-xl border border-cream-300/80 bg-white/90 p-4 shadow-sm">
            <p className="text-sm font-semibold text-forest-900">Borrowing details</p>
            <p className="mt-1 text-xs text-forest-700/80">
              Use <strong>Fill with AI</strong> to draft from your photos and the web, then edit anything that looks off.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className="btn-primary text-sm" disabled={fillAiLoading} onClick={() => void fillWithAi()}>
                {fillAiLoading ? "Filling…" : "Fill with AI"}
              </button>
              {!suggestionId ? (
                <p className="text-xs text-forest-700/80 self-center">Save is available after a successful Fill with AI.</p>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800 sm:col-span-2">
                Name *
                <input
                  className="input-cream text-sm"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800 sm:col-span-2">
                Category *
                <select
                  className="input-cream text-sm"
                  value={draft.category || (isCategoryId(sessionToyCategory) ? sessionToyCategory : "")}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {INTAKE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800 sm:col-span-2">
                Description
                <textarea
                  className="input-cream min-h-[72px] text-sm"
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Short description for borrowers"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800">
                Brand
                <input
                  className="input-cream text-sm"
                  value={draft.brand}
                  onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800">
                Condition label
                <select
                  className="input-cream text-sm"
                  value={draft.condition}
                  onChange={(e) => {
                    const cond = e.target.value;
                    const mid = midpointScoreForCondition(cond);
                    setDraft((d) => ({ ...d, condition: cond, condition_score: String(mid) }));
                  }}
                >
                  <option value="new">New</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800 sm:col-span-2">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span>Condition meter (from photos)</span>
                  <span className="font-mono text-[11px] font-normal text-forest-600">{scoreSafe} / 100</span>
                </span>
                <div className="relative pt-1">
                  <div
                    className="pointer-events-none absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-amber-200 via-yellow-100 to-emerald-200 opacity-90"
                    aria-hidden
                  />
                  {aiSuggestedScore != null ? (
                    <span
                      className="pointer-events-none absolute top-0 z-10 -ml-1 w-0.5 rounded-full bg-forest-900/80"
                      style={{
                        left: `calc(${aiSuggestedScore}% - 1px)`,
                        height: "28px",
                      }}
                      title={`AI suggested: ${aiSuggestedScore}`}
                    />
                  ) : null}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={scoreSafe}
                    className="relative z-20 w-full cursor-pointer accent-forest-800"
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      const cond = conditionFromScore(v);
                      setDraft((d) => ({
                        ...d,
                        condition_score: clampScoreStr(e.target.value, 65),
                        condition: cond,
                      }));
                    }}
                  />
                  <div className="mt-1 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-forest-600/90">
                    <span>Poor</span>
                    <span>Fair</span>
                    <span>Good</span>
                    <span>New</span>
                  </div>
                </div>
                {aiSuggestedScore != null ? (
                  <p className="mt-1 text-[10px] text-forest-600/85">Black tick: AI estimate. Adjust the slider to override.</p>
                ) : null}
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800">
                Age min
                <input
                  className="input-cream text-sm"
                  type="number"
                  min={0}
                  value={draft.age_min}
                  onChange={(e) => setDraft((d) => ({ ...d, age_min: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800">
                Age max
                <input
                  className="input-cream text-sm"
                  type="number"
                  min={0}
                  value={draft.age_max}
                  onChange={(e) => setDraft((d) => ({ ...d, age_max: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800 sm:col-span-2">
                Piece count
                <input
                  className="input-cream text-sm"
                  type="number"
                  min={0}
                  value={draft.piece_count}
                  onChange={(e) => setDraft((d) => ({ ...d, piece_count: e.target.value }))}
                />
              </label>
            </div>

            {fillWarnings.length > 0 ? (
              <ul className="mt-3 list-inside list-disc text-[11px] text-amber-900/90">
                {fillWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}

            {fillSources.length > 0 ? (
              <div className="mt-3">
                <p className="text-[11px] font-semibold text-forest-800">Sources (web)</p>
                <ul className="mt-1 space-y-1 text-[11px] text-forest-700">
                  {fillSources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer" className="break-all underline decoration-forest-600/30">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {suggestionConfidence && Object.keys(suggestionConfidence).length > 0 ? (
              <p className="mt-3 text-[11px] text-forest-700/70">
                Confidence (model): {JSON.stringify(suggestionConfidence)}
              </p>
            ) : null}

            <button
              type="button"
              className="btn-primary mt-4"
              disabled={acceptLoading || !draft.name.trim() || !suggestionId || !draft.category.trim()}
              onClick={() => void acceptSuggestion()}
            >
              {acceptLoading ? "Saving…" : "Accept & add to catalog"}
            </button>
          </div>

          <p className="mt-6 text-xs text-forest-700/70">
            Fill with AI uses OpenAI vision + web search on the server. Need different photos?{" "}
            <Link href={photosHref} className="font-semibold text-forest-800 underline">
              Go back
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
