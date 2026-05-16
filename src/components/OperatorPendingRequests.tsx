"use client";

import { useCallback, useEffect, useState } from "react";

type MembershipReq = {
  id: string;
  user_id: string;
  status: string;
  phone_number: string | null;
  note: string | null;
  created_at: string;
  profile: { email: string | null; full_name: string | null } | null;
};

type LoanReq = {
  id: string;
  item_id: string;
  member_user_id: string;
  status: string;
  member_note: string | null;
  requested_at: string;
  item_name: string | null;
  profile: { email: string | null; full_name: string | null } | null;
};

export function OperatorPendingRequests({
  libraryId,
  onChanged,
}: {
  libraryId: string;
  onChanged?: () => void;
}) {
  const [membershipReqs, setMembershipReqs] = useState<MembershipReq[]>([]);
  const [loanReqs, setLoanReqs] = useState<LoanReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, lRes] = await Promise.all([
        fetch(`/api/membership-requests?library_id=${encodeURIComponent(libraryId)}&status=pending`),
        fetch(
          `/api/catalog/loan-requests?library_id=${encodeURIComponent(libraryId)}&operator=1&status=pending`,
        ),
      ]);
      const mJson = (await mRes.json()) as { error?: string; requests?: MembershipReq[] };
      const lJson = (await lRes.json()) as { error?: string; requests?: LoanReq[] };
      if (!mRes.ok) throw new Error(mJson.error ?? "Failed membership requests");
      if (!lRes.ok) throw new Error(lJson.error ?? "Failed loan requests");
      setMembershipReqs(mJson.requests ?? []);
      setLoanReqs(lJson.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [libraryId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reviewMembership(id: string, status: "approved" | "rejected") {
    setActing(id);
    try {
      const res = await fetch(`/api/membership-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed");
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setActing(null);
    }
  }

  async function reviewLoan(id: string, status: "approved" | "declined") {
    setActing(id);
    try {
      const res = await fetch(`/api/catalog/loan-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed");
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setActing(null);
    }
  }

  if (loading) return <p className="text-sm text-forest-700">Loading pending requests…</p>;

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

      <section className="rounded-2xl border border-cream-300/80 bg-white/80 p-5 shadow-sm">
        <p className="text-sm font-semibold text-forest-900">Pending membership requests</p>
        {membershipReqs.length === 0 ? (
          <p className="mt-2 text-sm text-forest-700/90">None</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {membershipReqs.map((r) => (
              <li key={r.id} className="rounded-lg border border-cream-300/70 bg-cream-50/80 p-3 text-sm">
                <p className="font-semibold text-forest-900">{r.profile?.full_name ?? r.profile?.email ?? r.user_id}</p>
                {r.note ? <p className="mt-1 text-forest-800/85">{r.note}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary text-xs"
                    disabled={acting === r.id}
                    onClick={() => void reviewMembership(r.id, "approved")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={acting === r.id}
                    onClick={() => void reviewMembership(r.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-cream-300/80 bg-white/80 p-5 shadow-sm">
        <p className="text-sm font-semibold text-forest-900">Pending borrow requests</p>
        {loanReqs.length === 0 ? (
          <p className="mt-2 text-sm text-forest-700/90">None</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {loanReqs.map((r) => (
              <li key={r.id} className="rounded-lg border border-cream-300/70 bg-cream-50/80 p-3 text-sm">
                <p className="font-semibold text-forest-900">{r.item_name ?? r.item_id}</p>
                <p className="text-forest-800/85">{r.profile?.full_name ?? r.profile?.email ?? r.member_user_id}</p>
                {r.member_note ? <p className="mt-1 text-forest-700/90">{r.member_note}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary text-xs"
                    disabled={acting === r.id}
                    onClick={() => void reviewLoan(r.id, "approved")}
                  >
                    Approve loan
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={acting === r.id}
                    onClick={() => void reviewLoan(r.id, "declined")}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
