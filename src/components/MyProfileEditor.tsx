"use client";

import { useState } from "react";

export type MyProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "operator" | "member";
  phone_number: string | null;
  date_of_birth: string | null;
  marketing_opt_in: boolean | null;
  notification_email: boolean | null;
  notification_push: boolean | null;
  terms_accepted_at: string | null;
};

export function MyProfileEditor({ initial }: { initial: MyProfile }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [draft, setDraft] = useState(() => ({
    full_name: initial.full_name ?? "",
    phone_number: initial.phone_number ?? "",
    date_of_birth: initial.date_of_birth ?? "",
    marketing_opt_in: Boolean(initial.marketing_opt_in),
    notification_email: initial.notification_email ?? true,
    notification_push: initial.notification_push ?? true,
  }));

  async function save() {
    setError(null);
    setSavedMsg(null);
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: draft.full_name.trim() || null,
          phone_number: draft.phone_number.trim() || null,
          date_of_birth: draft.date_of_birth.trim() || null,
          marketing_opt_in: draft.marketing_opt_in,
          notification_email: draft.notification_email,
          notification_push: draft.notification_push,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to save profile");
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
          <h1 className="text-2xl font-bold text-forest-900">My profile</h1>
          <p className="mt-1 text-sm text-forest-800/85">Operator contact details and preferences.</p>
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
          <Card label="Role" value={initial.role} />
          <Card label="Email" value={initial.email ?? "—"} />
          <Card label="Full name" value={initial.full_name ?? "—"} />
          <Card label="Phone number" value={initial.phone_number ?? "—"} />
          <Card label="Date of birth" value={initial.date_of_birth ?? "—"} />
          <Card label="Marketing opt-in" value={initial.marketing_opt_in ? "Yes" : "No"} />
          <Card label="Email notifications" value={initial.notification_email === false ? "Off" : "On"} />
          <Card label="Push notifications" value={initial.notification_push === false ? "Off" : "On"} />
          <Card label="Terms accepted at" value={initial.terms_accepted_at ?? "—"} className="sm:col-span-2" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" value={draft.full_name} onChange={(v) => setDraft((d) => ({ ...d, full_name: v }))} />
          <Field label="Phone number" value={draft.phone_number} onChange={(v) => setDraft((d) => ({ ...d, phone_number: v }))} />
          <Field
            label="Date of birth"
            type="date"
            value={draft.date_of_birth}
            onChange={(v) => setDraft((d) => ({ ...d, date_of_birth: v }))}
          />

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cream-300/90 bg-cream-100/50 p-3 text-sm text-forest-900">
            <input
              type="checkbox"
              className="mt-1 accent-forest-700"
              checked={draft.marketing_opt_in}
              onChange={(e) => setDraft((d) => ({ ...d, marketing_opt_in: e.target.checked }))}
            />
            <span>Marketing opt-in</span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cream-300/90 bg-cream-100/50 p-3 text-sm text-forest-900">
            <input
              type="checkbox"
              className="mt-1 accent-forest-700"
              checked={draft.notification_email}
              onChange={(e) => setDraft((d) => ({ ...d, notification_email: e.target.checked }))}
            />
            <span>Email notifications</span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cream-300/90 bg-cream-100/50 p-3 text-sm text-forest-900">
            <input
              type="checkbox"
              className="mt-1 accent-forest-700"
              checked={draft.notification_push}
              onChange={(e) => setDraft((d) => ({ ...d, notification_push: e.target.checked }))}
            />
            <span>Push notifications</span>
          </label>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-cream-300/80 bg-cream-100/60 p-4 ${className ?? ""}`}>
      <p className="text-xs uppercase tracking-wide text-forest-700/70">{label}</p>
      <p className="mt-1 text-sm font-semibold text-forest-900">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
      {label}
      <input className="input-cream" type={type ?? "text"} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

