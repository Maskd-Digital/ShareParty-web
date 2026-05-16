"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMembershipFee } from "@/lib/formatMoney";

type JoinCard = {
  id: string;
  library_name: string;
  city: string | null;
  country: string | null;
  description: string | null;
  requires_paid_membership: boolean;
  membership_fee_amount: number;
  membership_fee_currency: string;
};

export function MemberJoinLibraryCard() {
  const router = useRouter();
  const [libraryId, setLibraryId] = useState("");
  const [joinCard, setJoinCard] = useState<JoinCard | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function lookup() {
    const id = libraryId.trim();
    if (!id) return;
    setSaving(true);
    setError(null);
    setJoinCard(null);
    try {
      const res = await fetch(`/api/libraries/lookup?library_id=${encodeURIComponent(id)}`);
      const j = (await res.json()) as { error?: string; library?: JoinCard };
      if (!res.ok) throw new Error(j.error ?? "Library not found");
      setJoinCard(j.library ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!joinCard) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/membership-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ library_id: joinCard.id, note: note.trim() || null }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to submit");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-dashed border-forest-500/40 bg-cream-100/60 p-4 space-y-3">
      <p className="text-sm font-semibold text-forest-900">Join a library</p>
      <p className="text-sm text-forest-800/85">Enter the library ID from your operator to request membership.</p>
      <label className="flex flex-col gap-1 text-sm font-medium text-forest-900">
        Library ID
        <input className="input-cream font-mono text-sm" value={libraryId} onChange={(e) => setLibraryId(e.target.value)} />
      </label>
      <button type="button" className="btn-secondary text-sm" disabled={saving || !libraryId.trim()} onClick={() => void lookup()}>
        Look up library
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {joinCard ? (
        <div className="rounded-lg border border-cream-300/80 bg-white/90 p-3 text-sm">
          <p className="font-semibold text-forest-900">{joinCard.library_name}</p>
          <p className="text-forest-800/85">{[joinCard.city, joinCard.country].filter(Boolean).join(", ") || "—"}</p>
          {joinCard.requires_paid_membership ? (
            <p className="mt-2 text-forest-800">
              Membership fee: {formatMembershipFee(joinCard.membership_fee_amount, joinCard.membership_fee_currency)}
            </p>
          ) : null}
          <label className="mt-2 flex flex-col gap-1 font-medium text-forest-900">
            Note (optional)
            <textarea className="input-cream min-h-[60px]" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="button" className="btn-primary mt-2 text-sm" disabled={saving} onClick={() => void submit()}>
            Request to join
          </button>
        </div>
      ) : null}
    </section>
  );
}
