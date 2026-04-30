"use client";

import { useMemo, useState } from "react";

export type LibraryProfile = {
  id: string;
  library_name: string;
  country: string | null;
  city: string | null;
  postal_code: string | null;
  phone_number: string | null;
  contact_email: string | null;
  description: string | null;
  street_address: string | null;
  suburb: string | null;
  requires_paid_membership: boolean;
  is_setls_member: boolean;
  max_items_per_member: number;
  loan_period_days: number;
  renewals_allowed: boolean;
  late_return_policy: string | null;
};

export function LibraryProfileEditor({ initial }: { initial: LibraryProfile }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [draft, setDraft] = useState(() => ({
    library_name: initial.library_name ?? "",
    country: initial.country ?? "",
    city: initial.city ?? "",
    postal_code: initial.postal_code ?? "",
    phone_number: initial.phone_number ?? "",
    contact_email: initial.contact_email ?? "",
    description: initial.description ?? "",
    street_address: initial.street_address ?? "",
    suburb: initial.suburb ?? "",
    requires_paid_membership: Boolean(initial.requires_paid_membership),
    is_setls_member: Boolean(initial.is_setls_member),
    max_items_per_member: Number.isFinite(initial.max_items_per_member) ? initial.max_items_per_member : 3,
    loan_period_days: Number.isFinite(initial.loan_period_days) ? initial.loan_period_days : 14,
    renewals_allowed: Boolean(initial.renewals_allowed),
    late_return_policy: initial.late_return_policy ?? "",
  }));

  const viewRows = useMemo(
    () =>
      [
        ["Library name", initial.library_name],
        ["Country", initial.country ?? "—"],
        ["City", initial.city ?? "—"],
        ["Postal code", initial.postal_code ?? "—"],
        ["Phone number", initial.phone_number ?? "—"],
        ["Contact email", initial.contact_email ?? "—"],
        ["Street address", initial.street_address ?? "—"],
        ["Suburb", initial.suburb ?? "—"],
        ["Description", initial.description ?? "—"],
        ["Requires paid membership", initial.requires_paid_membership ? "Yes" : "No"],
        ["SETLS member", initial.is_setls_member ? "Yes" : "No"],
        ["Max items per member", String(initial.max_items_per_member)],
        ["Loan period (days)", String(initial.loan_period_days)],
        ["Renewals allowed", initial.renewals_allowed ? "Yes" : "No"],
        ["Late return policy", initial.late_return_policy ?? "—"],
      ] as const,
    [initial],
  );

  async function save() {
    setError(null);
    setSavedMsg(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/libraries/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          library_name: draft.library_name,
          country: draft.country || null,
          city: draft.city || null,
          postal_code: draft.postal_code || null,
          phone_number: draft.phone_number || null,
          contact_email: draft.contact_email || null,
          description: draft.description || null,
          street_address: draft.street_address || null,
          suburb: draft.suburb || null,
          requires_paid_membership: draft.requires_paid_membership,
          is_setls_member: draft.is_setls_member,
          max_items_per_member: draft.max_items_per_member,
          loan_period_days: draft.loan_period_days,
          renewals_allowed: draft.renewals_allowed,
          late_return_policy: draft.late_return_policy || null,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to save");
      setSavedMsg("Saved. Refresh the page to see updated values.");
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-forest-900">Library profile</h1>
          <p className="mt-1 text-sm text-forest-800/85">View and edit your library’s public-facing details.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                  setSavedMsg(null);
                }}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setEditing(true)}>
              Edit profile
            </button>
          )}
        </div>
      </div>

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
      {savedMsg ? <p className="text-sm font-medium text-forest-800">{savedMsg}</p> : null}

      {!editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {viewRows.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-cream-300/80 bg-cream-100/60 p-4">
              <p className="text-xs uppercase tracking-wide text-forest-700/70">{label}</p>
              <p className="mt-1 text-sm font-semibold text-forest-900">{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Library name" value={draft.library_name} onChange={(v) => setDraft((d) => ({ ...d, library_name: v }))} required />
          <Field label="Country" value={draft.country} onChange={(v) => setDraft((d) => ({ ...d, country: v }))} />
          <Field label="City" value={draft.city} onChange={(v) => setDraft((d) => ({ ...d, city: v }))} />
          <Field label="Postal code" value={draft.postal_code} onChange={(v) => setDraft((d) => ({ ...d, postal_code: v }))} />
          <Field label="Phone number" value={draft.phone_number} onChange={(v) => setDraft((d) => ({ ...d, phone_number: v }))} />
          <Field label="Contact email" type="email" value={draft.contact_email} onChange={(v) => setDraft((d) => ({ ...d, contact_email: v }))} />
          <Field label="Street address" value={draft.street_address} onChange={(v) => setDraft((d) => ({ ...d, street_address: v }))} className="sm:col-span-2" />
          <Field label="Suburb" value={draft.suburb} onChange={(v) => setDraft((d) => ({ ...d, suburb: v }))} className="sm:col-span-2" />

          <label className="sm:col-span-2 flex cursor-pointer items-start gap-3 rounded-xl border border-cream-300/90 bg-cream-100/50 p-3 text-sm text-forest-900">
            <input
              type="checkbox"
              className="mt-1 accent-forest-700"
              checked={draft.requires_paid_membership}
              onChange={(e) => setDraft((d) => ({ ...d, requires_paid_membership: e.target.checked }))}
            />
            <span>Requires paid membership</span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cream-300/90 bg-cream-100/50 p-3 text-sm text-forest-900">
            <input
              type="checkbox"
              className="mt-1 accent-forest-700"
              checked={draft.is_setls_member}
              onChange={(e) => setDraft((d) => ({ ...d, is_setls_member: e.target.checked }))}
            />
            <span>SETLS member</span>
          </label>

          <NumberField
            label="Max items per member"
            value={draft.max_items_per_member}
            min={1}
            onChange={(v) => setDraft((d) => ({ ...d, max_items_per_member: v }))}
          />
          <NumberField
            label="Loan period (days)"
            value={draft.loan_period_days}
            min={1}
            onChange={(v) => setDraft((d) => ({ ...d, loan_period_days: v }))}
          />
          <label className="sm:col-span-2 flex cursor-pointer items-start gap-3 rounded-xl border border-cream-300/90 bg-cream-100/50 p-3 text-sm text-forest-900">
            <input
              type="checkbox"
              className="mt-1 accent-forest-700"
              checked={draft.renewals_allowed}
              onChange={(e) => setDraft((d) => ({ ...d, renewals_allowed: e.target.checked }))}
            />
            <span>Renewals allowed</span>
          </label>

          <label className="sm:col-span-2 flex flex-col gap-1.5 text-sm font-medium text-forest-900">
            Late return policy (optional)
            <textarea
              className="input-cream min-h-20"
              value={draft.late_return_policy}
              onChange={(e) => setDraft((d) => ({ ...d, late_return_policy: e.target.value }))}
            />
          </label>

          <label className="sm:col-span-2 flex flex-col gap-1.5 text-sm font-medium text-forest-900">
            Description
            <textarea
              className="input-cream min-h-24"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm font-medium text-forest-900 ${className ?? ""}`}>
      {label}
      <input className="input-cream" type={type ?? "text"} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
      {label}
      <input
        className="input-cream"
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

