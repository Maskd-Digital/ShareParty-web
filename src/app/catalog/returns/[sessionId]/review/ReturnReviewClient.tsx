"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhotoSourcePicker } from "@/components/PhotoSourcePicker";
import { CATALOG_TOY_PHOTOS_BUCKET } from "@/lib/catalogStorage";
import { createClient } from "@/lib/supabase/client";

type ReportRow = {
  id: string;
  created_at: string;
  condition_score: number | null;
  condition_label: string | null;
  findings: Record<string, unknown>;
  needs_manual_review: boolean;
};

export function ReturnReviewClient({
  sessionId,
  libraryId,
  itemName,
  memberPhotos,
  operatorPhotoSigned: initialOperatorSigned,
  catalogPhotosSigned,
  initialReports,
}: {
  sessionId: string;
  libraryId: string;
  itemName: string;
  memberPhotos: { shot_key: string; signedUrl: string | null }[];
  operatorPhotoSigned: string | null;
  catalogPhotosSigned: string[];
  initialReports: ReportRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportRow[]>(initialReports);
  const [operatorPhotoSigned, setOperatorPhotoSigned] = useState<string | null>(initialOperatorSigned);
  const [notes, setNotes] = useState("");

  async function runAnalyze(mode: "with_catalog" | "with_operator") {
    setError(null);
    setBusy(mode);
    try {
      const res = await fetch("/api/ai/return/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ return_session_id: sessionId, mode }),
      });
      const j = (await res.json()) as {
        error?: string;
        report?: {
          id: string;
          condition_score: number;
          condition_label: string;
          summary: string;
          wear_notes: string[];
          compared_to_catalog: string;
          needs_manual_review: boolean;
        };
      };
      if (!res.ok) throw new Error(j.error ?? "Analysis failed");
      if (j.report) {
        const row: ReportRow = {
          id: j.report.id,
          created_at: new Date().toISOString(),
          condition_score: j.report.condition_score,
          condition_label: j.report.condition_label,
          findings: {
            summary: j.report.summary,
            wear_notes: j.report.wear_notes,
            compared_to_catalog: j.report.compared_to_catalog,
          },
          needs_manual_review: j.report.needs_manual_review,
        };
        setReports((prev) => [row, ...prev]);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  async function uploadOperatorPhoto(file: File) {
    setError(null);
    setBusy("upload_op");
    try {
      const supabase = createClient();
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
      const path = `${libraryId}/return/${sessionId}/operator_addendum/${id}.${ext}`;

      const { error: upErr } = await supabase.storage.from(CATALOG_TOY_PHOTOS_BUCKET).upload(path, file, {
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
          shot_key: "operator_addendum",
          url: path,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to record operator photo");

      const { data: signed, error: signErr } = await supabase.storage
        .from(CATALOG_TOY_PHOTOS_BUCKET)
        .createSignedUrl(path, 3600);
      if (signErr || !signed?.signedUrl) throw new Error(signErr?.message ?? "Could not sign URL");
      setOperatorPhotoSigned(signed.signedUrl);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  async function resolve(outcome: "approved" | "damaged") {
    setError(null);
    setBusy(outcome);
    try {
      const res = await fetch(`/api/catalog/return-sessions/${encodeURIComponent(sessionId)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, notes }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Could not update return");
      router.replace("/catalog");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

      <section className="rounded-2xl border border-cream-300/80 bg-cream-50/90 p-6 shadow-card">
        <h2 className="text-lg font-semibold text-forest-900">Member return photos</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {memberPhotos.map((p) => (
            <li key={p.shot_key} className="overflow-hidden rounded-xl border border-cream-300/70 bg-white/90">
              <div className="aspect-[4/3] w-full bg-cream-200/80">
                {p.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL
                  <img src={p.signedUrl} alt={p.shot_key} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-forest-600">Unavailable</div>
                )}
              </div>
              <p className="px-2 py-2 text-xs font-semibold text-forest-800">{p.shot_key}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-cream-300/80 bg-cream-50/90 p-6 shadow-card">
        <h2 className="text-lg font-semibold text-forest-900">Catalog originals</h2>
        <p className="mt-1 text-xs text-forest-700/85">Used by AI and for your visual comparison.</p>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {catalogPhotosSigned.map((url, i) => (
            <li key={`${url}-${i}`} className="overflow-hidden rounded-xl border border-cream-300/70 bg-white/90">
              <div className="aspect-[4/3] w-full bg-cream-200/80">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                <img src={url} alt={`Catalog ${i + 1}`} className="h-full w-full object-cover" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-cream-300/80 bg-cream-50/90 p-6 shadow-card">
        <h2 className="text-lg font-semibold text-forest-900">AI analysis</h2>
        <p className="mt-1 text-sm text-forest-800/85">
          Compare return shots to <span className="font-semibold">{itemName}</span> catalog images. Add an optional operator
          photo, then run analysis including it.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy !== null}
            onClick={() => void runAnalyze("with_catalog")}
          >
            {busy === "with_catalog" ? "Analyzing…" : "Analyze with originals"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy !== null || !operatorPhotoSigned}
            onClick={() => void runAnalyze("with_operator")}
            title={!operatorPhotoSigned ? "Upload an operator verification photo first" : undefined}
          >
            {busy === "with_operator" ? "Analyzing…" : "Analyze with operator photo"}
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-cream-300/70 bg-cream-100/50 p-4">
          <p className="text-sm font-semibold text-forest-900">Operator verification photo (optional)</p>
          <p className="mt-1 text-xs text-forest-700/85">One addendum image for unclear cases. Replaces any previous operator addendum.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <PhotoSourcePicker
              size="compact"
              buttonLabel="Upload operator photo"
              uploadingLabel="Uploading…"
              onFile={(file) => void uploadOperatorPhoto(file)}
              disabled={busy !== null}
              uploading={busy === "upload_op"}
            />
            {operatorPhotoSigned ? (
              <span className="text-xs font-semibold text-forest-700">Ready</span>
            ) : (
              <span className="text-xs text-forest-600/80">Not set</span>
            )}
          </div>
          {operatorPhotoSigned ? (
            <div className="mt-4 max-w-xs overflow-hidden rounded-lg border border-cream-300/80 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={operatorPhotoSigned} alt="Operator addendum" className="h-auto w-full object-cover" />
            </div>
          ) : null}
        </div>

        {reports.length ? (
          <ul className="mt-6 space-y-4">
            {reports.map((r) => (
              <li key={r.id} className="rounded-xl border border-cream-300/70 bg-white/95 p-4 text-sm text-forest-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-forest-600/90">
                  {new Date(r.created_at).toLocaleString()}
                </p>
                <p className="mt-2">
                  <span className="font-semibold text-forest-900">Score:</span>{" "}
                  <span className="font-mono">{r.condition_score ?? "—"}</span>{" "}
                  <span className="text-forest-600">({r.condition_label ?? "—"})</span>
                  {r.needs_manual_review ? (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      Manual review suggested
                    </span>
                  ) : null}
                </p>
                {typeof r.findings.summary === "string" ? <p className="mt-2">{r.findings.summary}</p> : null}
                {Array.isArray(r.findings.wear_notes) && r.findings.wear_notes.length ? (
                  <ul className="mt-2 list-disc pl-5">
                    {(r.findings.wear_notes as unknown[]).filter((x): x is string => typeof x === "string").map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                ) : null}
                {typeof r.findings.compared_to_catalog === "string" ? (
                  <p className="mt-2 text-xs text-forest-700/90">{r.findings.compared_to_catalog}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-xs text-forest-600/85">No AI reports yet for this return.</p>
        )}
      </section>

      <section className="rounded-2xl border border-cream-300/80 bg-cream-50/90 p-6 shadow-card">
        <h2 className="text-lg font-semibold text-forest-900">Decision</h2>
        <label className="mt-3 block text-sm font-medium text-forest-900">
          Notes (optional)
          <textarea
            className="input-cream mt-1 min-h-[88px] w-full"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Visible wear, missing pieces, etc."
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={busy !== null}
            onClick={() => void resolve("approved")}
          >
            {busy === "approved" ? "Saving…" : "Approve return"}
          </button>
          <button
            type="button"
            className="rounded-xl border border-red-300/90 bg-red-50 px-4 py-2 text-sm font-semibold text-red-900 hover:bg-red-100/90 disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => void resolve("damaged")}
          >
            {busy === "damaged" ? "Saving…" : "Flag as damaged"}
          </button>
        </div>
      </section>
    </div>
  );
}
