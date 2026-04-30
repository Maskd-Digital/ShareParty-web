"use client";

import { useEffect, useMemo, useState } from "react";

type Member = {
  user_id: string;
  status: string;
  payment_status: string;
  created_at: string;
  membership_id: string | null;
  source: string;
  profile: {
    id: string;
    email: string | null;
    full_name: string | null;
    phone_number: string | null;
    created_at: string;
  } | null;
};

export function MembersManager({ libraryId, libraryName }: { libraryId: string; libraryName: string }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const [onboardEmail, setOnboardEmail] = useState("");
  const [onboardUserId, setOnboardUserId] = useState("");
  const [onboardFullName, setOnboardFullName] = useState("");
  const [onboardLoading, setOnboardLoading] = useState(false);
  const [onboardMsg, setOnboardMsg] = useState<string | null>(null);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/members?library_id=${encodeURIComponent(libraryId)}&q=${encodeURIComponent(q)}`);
      const j = (await res.json()) as { error?: string; members?: Member[] };
      if (!res.ok) throw new Error(j.error ?? "Failed to load members");
      setMembers(j.members ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function onboard() {
    setOnboardMsg(null);
    setError(null);
    setOnboardLoading(true);
    try {
      const res = await fetch("/api/members/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          library_id: libraryId,
          email: onboardEmail.trim() || undefined,
          user_id: onboardUserId.trim() || undefined,
          full_name: onboardFullName.trim() || undefined,
        }),
      });
      const j = (await res.json()) as { error?: string; membershipId?: string; already?: boolean };
      if (!res.ok) throw new Error(j.error ?? "Failed to onboard member");
      setOnboardMsg(j.already ? "Member already onboarded." : "Member onboarded.");
      setOnboardEmail("");
      setOnboardUserId("");
      setOnboardFullName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setOnboardLoading(false);
    }
  }

  const countText = useMemo(() => {
    if (loading) return "Loading…";
    return `${members.length} member${members.length === 1 ? "" : "s"}`;
  }, [members.length, loading]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-forest-900">Members</h1>
          <p className="mt-1 text-sm text-forest-800/85">
            Manage members for <span className="font-semibold text-forest-900">{libraryName}</span>.
          </p>
        </div>
        <div className="text-sm font-semibold text-forest-800/80">{countText}</div>
      </div>

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

      <section className="rounded-2xl border border-cream-300/80 bg-white/80 p-5 shadow-sm">
        <p className="text-sm font-semibold text-forest-900">Search</p>
        <p className="mt-1 text-xs text-forest-700/75">Search by name, email, phone, or membership id.</p>
        <input
          className="input-cream mt-3 w-full"
          placeholder="Search members…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </section>

      <section className="rounded-2xl border border-cream-300/80 bg-cream-100/40 p-5 shadow-sm">
        <p className="text-sm font-semibold text-forest-900">Onboard existing member</p>
        <p className="mt-1 text-xs text-forest-700/75">
          Add a membership for an existing account. Use email (recommended) or paste a user id.
        </p>

        {onboardMsg ? <p className="mt-3 text-sm font-medium text-forest-800">{onboardMsg}</p> : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
            Member email
            <input
              className="input-cream"
              value={onboardEmail}
              onChange={(e) => setOnboardEmail(e.target.value)}
              placeholder="member@email.com"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
            Or member user id
            <input
              className="input-cream"
              value={onboardUserId}
              onChange={(e) => setOnboardUserId(e.target.value)}
              placeholder="uuid…"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900 sm:col-span-2">
            Member full name (optional)
            <input
              className="input-cream"
              value={onboardFullName}
              onChange={(e) => setOnboardFullName(e.target.value)}
              placeholder="Used only if the member profile name is blank."
              autoComplete="off"
            />
          </label>
        </div>

        <button type="button" className="btn-primary mt-4" disabled={onboardLoading} onClick={() => void onboard()}>
          {onboardLoading ? "Adding…" : "Add member"}
        </button>
      </section>

      <section className="rounded-2xl border border-cream-300/80 bg-white/80 p-5 shadow-sm">
        <p className="text-sm font-semibold text-forest-900">Member list</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-forest-700/70">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Payment</th>
                <th className="py-2 pr-4">Joined</th>
              </tr>
            </thead>
            <tbody className="text-forest-900">
              {members.map((m) => (
                <tr key={`${m.user_id}-${m.created_at}`} className="border-t border-cream-200/80">
                  <td className="py-2 pr-4 font-semibold">{m.profile?.full_name ?? "—"}</td>
                  <td className="py-2 pr-4">{m.profile?.email ?? "—"}</td>
                  <td className="py-2 pr-4">{m.profile?.phone_number ?? "—"}</td>
                  <td className="py-2 pr-4">{m.status}</td>
                  <td className="py-2 pr-4">{m.payment_status}</td>
                  <td className="py-2 pr-4 text-xs text-forest-800/80">
                    {new Date(m.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {members.length === 0 && !loading ? (
                <tr>
                  <td className="py-4 text-sm text-forest-800/80" colSpan={6}>
                    No members yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

