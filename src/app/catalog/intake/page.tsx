"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Category = "puzzles" | "construction" | "board_games" | "pretend_play" | "electronic_toy";

type Shot = {
  shot_key: string;
  label: string;
  instructions: string;
  framing: string;
  required: boolean;
  min_photos: number;
  max_photos: number;
  sort_order: number;
};

type JobPollState = "idle" | "queued" | "running" | "succeeded" | "failed";

type DraftFields = {
  name: string;
  description: string;
  category: string;
  brand: string;
  age_min: string;
  age_max: string;
  piece_count: string;
  tags: string;
  skills: string;
  condition: string;
  internal_ref: string;
  storage_location: string;
};

function emptyDraft(): DraftFields {
  return {
    name: "",
    description: "",
    category: "",
    brand: "",
    age_min: "",
    age_max: "",
    piece_count: "",
    tags: "",
    skills: "",
    condition: "good",
    internal_ref: "",
    storage_location: "",
  };
}

function draftFromSuggestion(sf: Record<string, unknown>): DraftFields {
  const tags = Array.isArray(sf.tags) ? sf.tags.filter((t): t is string => typeof t === "string").join(", ") : "";
  const skills = Array.isArray(sf.skills) ? sf.skills.filter((t): t is string => typeof t === "string").join(", ") : "";
  const cond = typeof sf.condition === "string" ? sf.condition : "good";
  return {
    name: typeof sf.name === "string" ? sf.name : "",
    description: typeof sf.description === "string" ? sf.description : "",
    category: typeof sf.category === "string" ? sf.category : "",
    brand: typeof sf.brand === "string" ? sf.brand : "",
    age_min: sf.age_min != null ? String(sf.age_min) : "",
    age_max: sf.age_max != null ? String(sf.age_max) : "",
    piece_count: sf.piece_count != null ? String(sf.piece_count) : "",
    tags,
    skills,
    condition: ["new", "good", "fair", "poor"].includes(cond) ? cond : "good",
    internal_ref: typeof sf.internal_ref === "string" ? sf.internal_ref : "",
    storage_location: typeof sf.storage_location === "string" ? sf.storage_location : "",
  };
}

function draftToFieldsPayload(d: DraftFields): Record<string, unknown> {
  const tags = d.tags
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const skills = d.skills
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const age_min = d.age_min.trim() ? parseInt(d.age_min, 10) : null;
  const age_max = d.age_max.trim() ? parseInt(d.age_max, 10) : null;
  const piece_count = d.piece_count.trim() ? parseInt(d.piece_count, 10) : null;
  return {
    name: d.name.trim() || "Untitled toy",
    description: d.description.trim() || null,
    category: d.category.trim() || null,
    brand: d.brand.trim() || null,
    age_min: Number.isFinite(age_min) ? age_min : null,
    age_max: Number.isFinite(age_max) ? age_max : null,
    piece_count: Number.isFinite(piece_count) ? piece_count : null,
    tags,
    skills,
    condition: d.condition,
    internal_ref: d.internal_ref.trim() || null,
    storage_location: d.storage_location.trim() || null,
  };
}

export default function CatalogIntakePage() {
  const categories = useMemo(
    () =>
      [
        { id: "puzzles", label: "Puzzles" },
        { id: "construction", label: "Construction sets" },
        { id: "board_games", label: "Board games" },
        { id: "pretend_play", label: "Pretend play" },
        { id: "electronic_toy", label: "Electronic toys" },
      ] as const,
    [],
  );

  const [category, setCategory] = useState<Category>("puzzles");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [recipeTitle, setRecipeTitle] = useState<string>("");
  const [recipeDesc, setRecipeDesc] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const [uploadingShot, setUploadingShot] = useState<string | null>(null);
  const [uploadedCountByShot, setUploadedCountByShot] = useState<Record<string, number>>({});
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [analyzeNote, setAnalyzeNote] = useState<string | null>(null);
  const [jobPollState, setJobPollState] = useState<JobPollState>("idle");
  const [jobPollError, setJobPollError] = useState<string | null>(null);
  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const [suggestionConfidence, setSuggestionConfidence] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<DraftFields>(() => emptyDraft());
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [acceptedItemId, setAcceptedItemId] = useState<string | null>(null);
  const [suggestionLoadMessage, setSuggestionLoadMessage] = useState<string | null>(null);

  const fileInputByShot = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      setLoading(true);
      setSessionId(null);
      setLibraryId(null);
      setUploadedCountByShot({});
      setLastJobId(null);
      setJobPollState("idle");
      setJobPollError(null);
      setSuggestionId(null);
      setSuggestionConfidence(null);
      setDraft(emptyDraft());
      setAcceptedItemId(null);
      setSuggestionLoadMessage(null);
      setAnalyzeNote(null);
      try {
        const res = await fetch(`/api/photo-recipes?mode=intake&category=${encodeURIComponent(category)}`);
        const j = (await res.json()) as { error?: string; recipe?: { title: string; description: string }; shots?: Shot[] };
        if (!res.ok) throw new Error(j.error ?? "Failed to load recipe");
        if (cancelled) return;
        setRecipeTitle(j.recipe?.title ?? "");
        setRecipeDesc(j.recipe?.description ?? "");
        setShots(j.shots ?? []);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [category]);

  async function startSession() {
    setError(null);
    setLastJobId(null);
    setJobPollState("idle");
    setJobPollError(null);
    setSuggestionId(null);
    setSuggestionConfidence(null);
    setDraft(emptyDraft());
    setAcceptedItemId(null);
    setSuggestionLoadMessage(null);
    setAnalyzeNote(null);
    setLoading(true);
    try {
      const res = await fetch("/api/catalog/intake-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      const j = (await res.json()) as { error?: string; sessionId?: string; libraryId?: string; recipe?: { title: string; description: string }; shots?: Shot[] };
      if (!res.ok) throw new Error(j.error ?? "Failed to start intake");
      setSessionId(j.sessionId ?? null);
      setLibraryId(j.libraryId ?? null);
      if (j.recipe) {
        setRecipeTitle(j.recipe.title ?? recipeTitle);
        setRecipeDesc(j.recipe.description ?? recipeDesc);
      }
      if (j.shots) setShots(j.shots);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function uploadShot(shotKey: string, file: File) {
    if (!sessionId || !libraryId) return;
    setError(null);
    setUploadingShot(shotKey);
    try {
      const supabase = createClient();
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
      const path = `${libraryId}/intake/${sessionId}/${shotKey}/${id}.${ext}`;

      const { error: upErr } = await supabase.storage.from("toy-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upErr) throw new Error(upErr.message);

      const res = await fetch("/api/catalog/session-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_type: "intake", intake_session_id: sessionId, shot_key: shotKey, url: path }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to record photo");

      setUploadedCountByShot((prev) => ({ ...prev, [shotKey]: (prev[shotKey] ?? 0) + 1 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setUploadingShot(null);
    }
  }

  async function startAiAnalyze() {
    if (!sessionId) return;
    setError(null);
    setAnalyzeNote(null);
    setSuggestionId(null);
    setSuggestionConfidence(null);
    setDraft(emptyDraft());
    setJobPollState("idle");
    setJobPollError(null);
    setAcceptedItemId(null);
    setSuggestionLoadMessage(null);
    setAnalyzeLoading(true);
    try {
      const res = await fetch("/api/ai/intake/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intake_session_id: sessionId }),
      });
      const j = (await res.json()) as {
        error?: string;
        message?: string;
        jobRunId?: string;
        tasksEnqueued?: boolean;
        tasksSkippedReason?: string;
      };
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Analyze request failed");
      setLastJobId(j.jobRunId ?? null);
      if (j.tasksEnqueued) {
        setAnalyzeNote("AI job queued. Cloud Run worker will process when it runs.");
      } else if (j.tasksSkippedReason) {
        setAnalyzeNote(
          `Job saved as queued; Cloud Tasks not configured (${j.tasksSkippedReason}). Configure GCP env or run the worker manually.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setAnalyzeLoading(false);
    }
  }

  useEffect(() => {
    if (!lastJobId || !sessionId) return;
    const jobId = lastJobId;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function handleSucceeded() {
      const sid = sessionId;
      if (!sid) return;
      setSuggestionLoadMessage(null);
      const sRes = await fetch(`/api/ai/intake/suggestions?intake_session_id=${encodeURIComponent(sid)}`);
      const sj = (await sRes.json()) as {
        error?: string;
        suggestion?: {
          id: string;
          suggested_fields: Record<string, unknown>;
          confidence: Record<string, unknown>;
          accepted_at: string | null;
        } | null;
      };
      if (cancelled || !sRes.ok) return;
      const s = sj.suggestion;
      if (s?.suggested_fields && !s.accepted_at) {
        setSuggestionId(s.id);
        setSuggestionConfidence(s.confidence ?? {});
        setDraft(draftFromSuggestion(s.suggested_fields));
      } else if (!s || s.accepted_at) {
        setSuggestionLoadMessage(
          s?.accepted_at
            ? "This session was already saved to the catalog."
            : "No AI suggestion found yet. If the job just finished, refresh in a moment or check the worker.",
        );
      }
    }

    async function pollOnce() {
      const res = await fetch(`/api/ai/intake/jobs/${encodeURIComponent(jobId)}`);
      const j = (await res.json()) as {
        error?: string | null;
        status?: string;
        message?: string;
      };
      if (cancelled) return;
      if (!res.ok) {
        setJobPollError(j.error ?? j.message ?? "Job poll failed");
        setJobPollState("failed");
        if (intervalId) clearInterval(intervalId);
        return;
      }

      const st = j.status as JobPollState | undefined;
      if (st === "queued" || st === "running") {
        setJobPollState(st);
        setJobPollError(null);
        return;
      }
      if (st === "failed") {
        setJobPollState("failed");
        setJobPollError(j.error ?? "AI job failed");
        if (intervalId) clearInterval(intervalId);
        return;
      }
      if (st === "succeeded") {
        setJobPollState("succeeded");
        setJobPollError(null);
        if (intervalId) clearInterval(intervalId);
        await handleSucceeded();
      }
    }

    setJobPollState("queued");
    void pollOnce();
    intervalId = setInterval(() => void pollOnce(), 2000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [lastJobId, sessionId]);

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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-700/80">Manage catalog</p>
          <h1 className="text-2xl font-bold text-forest-900">New intake</h1>
        </div>
        <Link href="/catalog" className="text-sm font-semibold text-forest-700 underline decoration-forest-600/30 underline-offset-2">
          Back
        </Link>
      </div>

      <div className="rounded-2xl border border-cream-300/80 bg-cream-50/90 p-6 shadow-card sm:p-8">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
          Toy type
          <select
            className="input-cream"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            disabled={loading}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        {error ? <p className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}

        <div className="mt-6 rounded-xl border border-cream-300/80 bg-cream-100/60 p-4">
          <p className="text-sm font-semibold text-forest-900">{recipeTitle || "Photo checklist"}</p>
          {recipeDesc ? <p className="mt-1 text-xs text-forest-800/80">{recipeDesc}</p> : null}
          {!sessionId ? (
            <button type="button" className="btn-primary mt-4" disabled={loading} onClick={() => void startSession()}>
              Start intake
            </button>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-xs text-forest-700/75">Session started. Upload photos below, then run AI analysis.</p>
              <button type="button" className="btn-primary text-sm" disabled={analyzeLoading} onClick={() => void startAiAnalyze()}>
                {analyzeLoading ? "Queueing…" : "Analyze & autofill (AI)"}
              </button>
            </div>
          )}
          {lastJobId ? (
            <p className="mt-2 text-xs font-mono text-forest-800/80">
              Job: {lastJobId}
            </p>
          ) : null}
          {analyzeNote ? <p className="mt-2 text-xs text-forest-700/85">{analyzeNote}</p> : null}
          {lastJobId && jobPollState !== "idle" ? (
            <p className="mt-2 text-xs font-medium text-forest-800">
              AI job: {jobPollState}
              {jobPollState === "failed" && jobPollError ? ` — ${jobPollError}` : ""}
            </p>
          ) : null}
        </div>

        {acceptedItemId ? (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50/90 p-4 text-sm text-forest-900">
            <p className="font-semibold">Saved to catalog.</p>
            <p className="mt-1 font-mono text-xs text-forest-700">Item id: {acceptedItemId}</p>
            <Link href="/catalog" className="mt-2 inline-block text-sm font-semibold text-forest-700 underline">
              Back to catalog
            </Link>
          </div>
        ) : suggestionId && jobPollState === "succeeded" ? (
          <div className="mt-6 rounded-xl border border-cream-300/80 bg-white/90 p-4 shadow-sm">
            <p className="text-sm font-semibold text-forest-900">Suggested details</p>
            <p className="mt-1 text-xs text-forest-700/80">Edit if needed, then accept to create the catalog item.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800">
                Name *
                <input
                  className="input-cream text-sm"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800">
                Condition
                <select
                  className="input-cream text-sm"
                  value={draft.condition}
                  onChange={(e) => setDraft((d) => ({ ...d, condition: e.target.value }))}
                >
                  <option value="new">New</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800 sm:col-span-2">
                Description
                <textarea
                  className="input-cream min-h-[72px] text-sm"
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800">
                Category
                <input
                  className="input-cream text-sm"
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
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
              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800">
                Piece count
                <input
                  className="input-cream text-sm"
                  type="number"
                  min={0}
                  value={draft.piece_count}
                  onChange={(e) => setDraft((d) => ({ ...d, piece_count: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800">
                Internal ref
                <input
                  className="input-cream text-sm"
                  value={draft.internal_ref}
                  onChange={(e) => setDraft((d) => ({ ...d, internal_ref: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800 sm:col-span-2">
                Tags (comma-separated)
                <input
                  className="input-cream text-sm"
                  value={draft.tags}
                  onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800 sm:col-span-2">
                Skills (comma-separated)
                <input
                  className="input-cream text-sm"
                  value={draft.skills}
                  onChange={(e) => setDraft((d) => ({ ...d, skills: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-forest-800 sm:col-span-2">
                Storage location
                <input
                  className="input-cream text-sm"
                  value={draft.storage_location}
                  onChange={(e) => setDraft((d) => ({ ...d, storage_location: e.target.value }))}
                />
              </label>
            </div>
            {suggestionConfidence && Object.keys(suggestionConfidence).length > 0 ? (
              <p className="mt-3 text-[11px] text-forest-700/70">
                Confidence (model): {JSON.stringify(suggestionConfidence)}
              </p>
            ) : null}
            <button
              type="button"
              className="btn-primary mt-4"
              disabled={acceptLoading || !draft.name.trim()}
              onClick={() => void acceptSuggestion()}
            >
              {acceptLoading ? "Saving…" : "Accept & add to catalog"}
            </button>
          </div>
        ) : null}

        {jobPollState === "succeeded" && !suggestionId && !acceptedItemId && suggestionLoadMessage ? (
          <p className="mt-4 text-sm text-forest-800/90">{suggestionLoadMessage}</p>
        ) : null}

        <ul className="mt-4 space-y-3">
          {(shots ?? []).map((s) => (
            <li key={s.shot_key} className="rounded-xl border border-cream-300/80 bg-cream-100/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-forest-900">
                    {s.label} {s.required ? <span className="text-xs font-semibold text-forest-700/70">(required)</span> : null}
                  </p>
                  <p className="mt-1 text-sm text-forest-800/85">{s.instructions}</p>
                </div>
                <span className="rounded-full bg-cream-200 px-3 py-1 text-xs font-semibold text-forest-800">
                  {s.framing}
                </span>
              </div>
              <p className="mt-2 text-xs text-forest-700/75">
                Photos: {s.min_photos}
                {s.max_photos !== s.min_photos ? `–${s.max_photos}` : ""}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  ref={(el) => {
                    fileInputByShot.current[s.shot_key] = el;
                  }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    void uploadShot(s.shot_key, f);
                    // reset so user can pick same file again if needed
                    e.currentTarget.value = "";
                  }}
                  disabled={!sessionId || uploadingShot === s.shot_key}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!sessionId || uploadingShot === s.shot_key}
                  onClick={() => fileInputByShot.current[s.shot_key]?.click()}
                >
                  {uploadingShot === s.shot_key ? "Uploading…" : "Add photo"}
                </button>
                <span className="text-xs font-semibold text-forest-700/75">
                  Uploaded: {uploadedCountByShot[s.shot_key] ?? 0}
                </span>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs text-forest-700/70">
          Photos are uploaded to Supabase Storage (`toy-images`) and recorded against the shot key for AI to consume later.
        </p>
      </div>
    </div>
  );
}

