"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhotoSourcePicker } from "@/components/PhotoSourcePicker";
import { RETURN_PHOTOS_BUCKET } from "@/lib/catalogStorage";
import { createClient } from "@/lib/supabase/client";
import { FIXED_INTAKE_SHOTS, intakeChecklistCopy, type IntakeShot } from "@/lib/intakePhotoChecklist";
import { INTAKE_CATEGORIES, type CategoryId } from "@/app/catalog/intake/formShared";

type Shot = IntakeShot;

export function ReturnPhotosClient({
  sessionId,
  libraryId,
  initialUploaded,
}: {
  sessionId: string;
  libraryId: string;
  initialUploaded: Record<string, number>;
}) {
  const router = useRouter();
  const [category] = useState<CategoryId>("puzzles");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingShot, setUploadingShot] = useState<string | null>(null);
  const [uploadedCountByShot, setUploadedCountByShot] = useState<Record<string, number>>(initialUploaded);

  const shots = useMemo(() => FIXED_INTAKE_SHOTS, []);
  const copy = useMemo(() => {
    const label = INTAKE_CATEGORIES.find((c) => c.id === category)?.label ?? category;
    return intakeChecklistCopy(label);
  }, [category]);

  const allRequiredPhotosDone = useMemo(() => {
    return FIXED_INTAKE_SHOTS.every((s) => {
      if (!s.required) return true;
      return (uploadedCountByShot[s.shot_key] ?? 0) >= s.min_photos;
    });
  }, [uploadedCountByShot]);

  async function uploadShot(shotKey: string, file: File) {
    setError(null);
    setUploadingShot(shotKey);
    try {
      const supabase = createClient();
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
      const path = `${libraryId}/returns/${sessionId}/${shotKey}/${id}.${ext}`;

      const { error: upErr } = await supabase.storage.from(RETURN_PHOTOS_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upErr) throw new Error(upErr.message);

      const res = await fetch("/api/catalog/session-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: "return",
          return_session_id: sessionId,
          shot_key: shotKey,
          url: path,
        }),
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

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/catalog/return-sessions/${encodeURIComponent(sessionId)}/submit`, {
        method: "POST",
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Submit failed");
      router.replace("/returns");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-700/80">Return</p>
          <h1 className="text-2xl font-bold text-forest-900">Return photos</h1>
          <p className="mt-1 text-sm text-forest-800/85">
            Upload the same three angles the library uses for intake so the operator can compare your return to the catalog.
          </p>
        </div>
        <Link href="/returns" className="text-sm font-semibold text-forest-700 underline decoration-forest-600/30 underline-offset-2">
          Back
        </Link>
      </div>

      <div className="rounded-2xl border border-cream-300/80 bg-cream-50/90 p-6 shadow-card sm:p-8">
        <div className="rounded-xl border border-cream-300/80 bg-cream-100/60 p-4">
          <p className="text-sm font-semibold text-forest-900">{copy.title}</p>
          <p className="mt-1 text-xs text-forest-800/80">{copy.description}</p>
        </div>

        {error ? <p className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}

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
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <PhotoSourcePicker
                  onFile={(file) => void uploadShot(s.shot_key, file)}
                  disabled={uploadingShot === s.shot_key}
                  uploading={uploadingShot === s.shot_key}
                />
                <span className="text-xs font-semibold text-forest-700/75">Uploaded: {uploadedCountByShot[s.shot_key] ?? 0}</span>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col gap-3 border-t border-cream-300/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-forest-700/80">
            {allRequiredPhotosDone
              ? "Submit when you are done — the operator will review your photos."
              : "Upload all three required photos before submitting."}
          </p>
          <button
            type="button"
            className="btn-primary disabled:pointer-events-none disabled:opacity-50"
            disabled={!allRequiredPhotosDone || busy}
            onClick={() => void submit()}
          >
            {busy ? "Submitting…" : "Submit for review"}
          </button>
        </div>

        <p className="mt-6 text-xs text-forest-700/70">
          Stored in <code className="font-mono text-[11px]">{RETURN_PHOTOS_BUCKET}</code>.
        </p>
      </div>
    </div>
  );
}
