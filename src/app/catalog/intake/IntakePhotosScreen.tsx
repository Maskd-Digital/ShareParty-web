"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PhotoSourcePicker } from "@/components/PhotoSourcePicker";
import { CATALOG_TOY_PHOTOS_BUCKET } from "@/lib/catalogStorage";
import { createClient } from "@/lib/supabase/client";
import { FIXED_INTAKE_SHOTS, intakeChecklistCopy, type IntakeShot } from "@/lib/intakePhotoChecklist";
import { INTAKE_CATEGORIES, type CategoryId, isCategoryId } from "./formShared";

type Shot = IntakeShot;

export function IntakePhotosScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get("session");

  const [category, setCategory] = useState<CategoryId>("puzzles");
  const [loading, setLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(!!sessionParam);
  const [error, setError] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>(FIXED_INTAKE_SHOTS);
  const [recipeTitle, setRecipeTitle] = useState<string>("");
  const [recipeDesc, setRecipeDesc] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const [uploadingShot, setUploadingShot] = useState<string | null>(null);
  const [uploadedCountByShot, setUploadedCountByShot] = useState<Record<string, number>>({});

  useEffect(() => {
    const label = INTAKE_CATEGORIES.find((c) => c.id === category)?.label ?? category;
    const copy = intakeChecklistCopy(label);
    setRecipeTitle(copy.title);
    setRecipeDesc(copy.description);
  }, [category]);

  useEffect(() => {
    if (sessionId) return;
    setUploadedCountByShot({});
    setError(null);
  }, [category, sessionId]);

  useEffect(() => {
    if (!sessionParam) {
      setResumeLoading(false);
      return;
    }
    if (sessionId === sessionParam && libraryId) {
      setResumeLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setResumeLoading(true);
      setError(null);
      const supabase = createClient();
      const { data: row, error: qErr } = await supabase
        .from("catalog_intake_sessions")
        .select("id,library_id,toy_category,item_id")
        .eq("id", sessionParam)
        .maybeSingle();

      if (cancelled) return;

      if (qErr || !row) {
        setError("Could not resume this session.");
        setResumeLoading(false);
        router.replace("/catalog/intake");
        return;
      }

      if (row.item_id) {
        router.replace(`/catalog/intake/${encodeURIComponent(sessionParam)}/details`);
        return;
      }

      setSessionId(row.id);
      setLibraryId(row.library_id);
      const tc = typeof row.toy_category === "string" ? row.toy_category : "";
      if (isCategoryId(tc)) setCategory(tc);

      const { data: photos } = await supabase
        .from("session_photos")
        .select("shot_key")
        .eq("session_type", "intake")
        .eq("intake_session_id", row.id);

      if (cancelled) return;

      const counts: Record<string, number> = {};
      for (const p of photos ?? []) {
        if (p.shot_key) counts[p.shot_key] = (counts[p.shot_key] ?? 0) + 1;
      }
      setUploadedCountByShot(counts);
      setShots(FIXED_INTAKE_SHOTS);
      setResumeLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionParam, sessionId, libraryId, router]);

  const allRequiredPhotosDone = useMemo(() => {
    return FIXED_INTAKE_SHOTS.every((s) => {
      if (!s.required) return true;
      return (uploadedCountByShot[s.shot_key] ?? 0) >= s.min_photos;
    });
  }, [uploadedCountByShot]);

  async function startSession() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/catalog/intake-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      const j = (await res.json()) as {
        error?: string;
        sessionId?: string;
        libraryId?: string;
        shots?: Shot[];
      };
      if (!res.ok) throw new Error(j.error ?? "Failed to start intake");
      const sid = j.sessionId ?? null;
      setSessionId(sid);
      setLibraryId(j.libraryId ?? null);
      if (j.shots?.length) setShots(j.shots);
      setUploadedCountByShot({});
      if (sid) {
        router.replace(`/catalog/intake?session=${encodeURIComponent(sid)}`);
      }
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

      const { error: upErr } = await supabase.storage.from(CATALOG_TOY_PHOTOS_BUCKET).upload(path, file, {
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

  const detailsHref = sessionId ? `/catalog/intake/${encodeURIComponent(sessionId)}/details` : "#";

  if (resumeLoading) {
    return <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center text-sm text-forest-700">Loading session…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-700/80">Manage catalog</p>
          <h1 className="text-2xl font-bold text-forest-900">New intake — photos</h1>
          <p className="mt-1 text-sm text-forest-800/85">Upload all three photos on this screen, then continue to the details form.</p>
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
            onChange={(e) => setCategory(e.target.value as CategoryId)}
            disabled={loading || !!sessionId}
          >
            {INTAKE_CATEGORIES.map((c) => (
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
            <p className="mt-3 text-xs text-forest-700/75">Session active. Add one photo per step below.</p>
          )}
        </div>

        {sessionId ? (
          <>
            <ul className="mt-6 space-y-3">
              {(shots ?? []).map((s) => (
                <li key={s.shot_key} className="rounded-xl border border-cream-300/80 bg-cream-100/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-forest-900">
                        {s.label}{" "}
                        {s.required ? <span className="text-xs font-semibold text-forest-700/70">(required)</span> : null}
                      </p>
                      <p className="mt-1 text-sm text-forest-800/85">{s.instructions}</p>
                    </div>
                    <span className="rounded-full bg-cream-200 px-3 py-1 text-xs font-semibold text-forest-800">{s.framing}</span>
                  </div>
                  <p className="mt-2 text-xs text-forest-700/75">
                    Photos: {s.min_photos}
                    {s.max_photos !== s.min_photos ? `–${s.max_photos}` : ""}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <PhotoSourcePicker
                      onFile={(file) => void uploadShot(s.shot_key, file)}
                      disabled={!sessionId || uploadingShot === s.shot_key}
                      uploading={uploadingShot === s.shot_key}
                    />
                    <span className="text-xs font-semibold text-forest-700/75">Uploaded: {uploadedCountByShot[s.shot_key] ?? 0}</span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 border-t border-cream-300/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-forest-700/80">
                {allRequiredPhotosDone ? "All required photos are in. Continue to enter toy details and Fill with AI." : "Upload all three required photos to continue."}
              </p>
              {allRequiredPhotosDone ? (
                <Link href={detailsHref} className="btn-primary inline-block text-center no-underline">
                  Continue to details
                </Link>
              ) : (
                <span className="btn-primary pointer-events-none inline-block cursor-not-allowed opacity-50">Continue to details</span>
              )}
            </div>
          </>
        ) : null}

        <p className="mt-6 text-xs text-forest-700/70">
          Photos are stored in the <code className="font-mono text-[11px]">{CATALOG_TOY_PHOTOS_BUCKET}</code> bucket. The next
          screen has the borrowing form and Fill with AI.
        </p>
      </div>
    </div>
  );
}
