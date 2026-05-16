"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type MembershipReq = {
  id: string;
  library_id: string;
  status: string;
  library_name: string | null;
  created_at: string;
};

type LoanReq = {
  id: string;
  item_id: string;
  status: string;
  item_name: string | null;
  member_note: string | null;
  requested_at: string;
};

export function MemberRequestsClient({ libraryId }: { libraryId: string | null }) {
  const [membershipRequests, setMembershipRequests] = useState<MembershipReq[]>([]);
  const [loanRequests, setLoanRequests] = useState<LoanReq[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const mRes = await fetch("/api/membership-requests");
        const mJson = (await mRes.json()) as { error?: string; requests?: MembershipReq[] };
        if (!mRes.ok) throw new Error(mJson.error ?? "Failed");
        setMembershipRequests(mJson.requests ?? []);

        if (libraryId) {
          const lRes = await fetch(`/api/catalog/loan-requests?library_id=${encodeURIComponent(libraryId)}`);
          const lJson = (await lRes.json()) as { error?: string; requests?: LoanReq[] };
          if (!lRes.ok) throw new Error(lJson.error ?? "Failed");
          setLoanRequests(lJson.requests ?? []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [libraryId]);

  async function cancelLoan(id: string) {
    const res = await fetch(`/api/catalog/loan-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (res.ok) {
      setLoanRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: "cancelled" } : r)));
    }
  }

  if (loading) return <p className="text-sm text-forest-700">Loading…</p>;
  if (error) return <p className="text-sm text-red-700">{error}</p>;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-forest-900">Library membership</h2>
        {membershipRequests.length === 0 ? (
          <p className="mt-2 text-sm text-forest-700/90">No membership requests yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-cream-300/80 rounded-xl border border-cream-300/80">
            {membershipRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium text-forest-900">{r.library_name ?? r.library_id}</span>
                <span className="capitalize text-forest-700">{r.status}</span>
                {r.status === "approved" ? (
                  <Link
                    href={`/member/join/payment?library_id=${encodeURIComponent(r.library_id)}`}
                    className="text-sm font-medium text-forest-800 underline"
                  >
                    Complete payment
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {libraryId ? (
        <section>
          <h2 className="text-lg font-semibold text-forest-900">Borrow requests</h2>
          {loanRequests.length === 0 ? (
            <p className="mt-2 text-sm text-forest-700/90">No borrow requests yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-cream-300/80 rounded-xl border border-cream-300/80">
              {loanRequests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="font-medium text-forest-900">{r.item_name ?? r.item_id}</span>
                  <span className="capitalize text-forest-700">{r.status}</span>
                  {r.status === "pending" ? (
                    <button
                      type="button"
                      className="text-sm font-medium text-red-700 underline"
                      onClick={() => void cancelLoan(r.id)}
                    >
                      Cancel
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p className="text-sm text-forest-700/90">Join a library to request toys.</p>
      )}
    </div>
  );
}
