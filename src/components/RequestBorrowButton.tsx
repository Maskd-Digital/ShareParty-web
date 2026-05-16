"use client";

import { useState } from "react";

export function RequestBorrowButton({
  libraryId,
  itemId,
  disabled,
  disabledReason,
}: {
  libraryId: string;
  itemId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function submit() {
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/catalog/loan-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ library_id: libraryId, item_id: itemId, member_note: note.trim() || null }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Request failed");
      setMsg("Request submitted. The operator will review it.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-cream-300/80 pt-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-forest-900">
        Note (optional)
        <textarea className="input-cream min-h-[72px]" value={note} onChange={(e) => setNote(e.target.value)} disabled={disabled} />
      </label>
      {disabledReason ? <p className="text-sm text-forest-700/90">{disabledReason}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {msg ? <p className="text-sm font-medium text-forest-800">{msg}</p> : null}
      <button type="button" className="btn-primary" disabled={disabled || loading} onClick={() => void submit()}>
        {loading ? "Submitting…" : "Request to borrow"}
      </button>
    </div>
  );
}
