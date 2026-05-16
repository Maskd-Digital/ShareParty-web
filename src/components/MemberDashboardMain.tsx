import Link from "next/link";
import { MemberJoinLibraryCard } from "@/components/MemberJoinLibraryCard";
import type { MemberActivityItem, MemberDashboardStats } from "@/lib/memberDashboard";
import type { MemberContext } from "@/lib/memberContext";

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-cream-300/80 bg-cream-100/60 p-4">
      <p className="text-xs uppercase tracking-wide text-forest-700/70">{label}</p>
      <p className="mt-1 text-2xl font-bold text-forest-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-forest-700/75">{hint}</p> : null}
    </div>
  );
}

function activityLabel(kind: MemberActivityItem["kind"]): string {
  switch (kind) {
    case "loan_overdue":
      return "Overdue";
    case "loan_return_pending":
      return "Return review";
    case "loan_returned":
      return "Returned";
    case "loan_request_pending":
      return "Request pending";
    case "loan_request_decided":
      return "Request update";
    case "membership_pending":
      return "Join pending";
    case "membership_decided":
      return "Membership";
    default:
      return "Borrowed";
  }
}

function activityTone(kind: MemberActivityItem["kind"]): string {
  if (kind === "loan_overdue") return "bg-red-100 text-red-900";
  if (kind === "loan_return_pending" || kind === "loan_request_pending" || kind === "membership_pending") {
    return "bg-amber-100 text-amber-950";
  }
  if (kind === "loan_returned" || kind === "membership_decided") return "bg-emerald-100 text-emerald-950";
  return "bg-sky-100 text-sky-950";
}

export function MemberDashboardMain({
  email,
  ctx,
  stats,
  activity,
  libraryName,
}: {
  email: string | null;
  ctx: MemberContext | null;
  stats: MemberDashboardStats;
  activity: MemberActivityItem[];
  libraryName: string | null;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-forest-900">Dashboard</h1>
        <p className="mt-1 text-sm text-forest-800/85">
          Signed in as <span className="font-semibold text-forest-900">{email ?? "—"}</span>
        </p>
      </div>

      {ctx?.activeLibrary ? (
        <div className="rounded-xl border border-cream-300/80 bg-cream-100/60 p-4">
          <p className="text-xs uppercase tracking-wide text-forest-700/70">Your library</p>
          <p className="mt-1 text-lg font-semibold text-forest-900">{libraryName ?? ctx.activeLibrary.libraryName}</p>
        </div>
      ) : ctx?.paymentRequiredLibrary ? (
        <section className="rounded-xl border border-amber-300/80 bg-amber-50/80 p-4">
          <p className="text-sm font-semibold text-forest-900">Payment required</p>
          <p className="mt-1 text-sm text-forest-800/85">
            Complete payment to join {ctx.paymentRequiredLibrary.libraryName}.
          </p>
          <Link
            href={`/member/join/payment?library_id=${encodeURIComponent(ctx.paymentRequiredLibrary.libraryId)}`}
            className="btn-primary mt-3 inline-block text-sm no-underline"
          >
            Pay and join
          </Link>
        </section>
      ) : ctx?.pendingMembershipRequests.length ? (
        <section className="rounded-xl border border-cream-300/80 bg-cream-100/60 p-4 text-sm text-forest-800/90">
          Your library join request is pending operator approval.
        </section>
      ) : (
        <MemberJoinLibraryCard />
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Active borrows" value={stats.activeBorrows} hint="Currently on loan" />
        <StatCard label="Overdue" value={stats.overdueBorrows} />
        <StatCard label="Return pending" value={stats.returnPending} />
        <StatCard label="Pending requests" value={stats.pendingBorrowRequests} hint="Awaiting approval" />
        <StatCard label="Past returns" value={stats.totalReturns} hint="Completed loans" />
        <StatCard label="Children" value={stats.childrenCount} hint="On your account" />
      </section>

      {ctx?.activeLibrary ? (
        <div className="flex flex-wrap gap-2">
          <Link href="/member/catalog" className="btn-primary text-sm no-underline">
            Browse catalog
          </Link>
          <Link href="/returns" className="btn-secondary text-sm no-underline">
            My borrows
          </Link>
          <Link href="/member/requests" className="btn-secondary text-sm no-underline">
            My requests
          </Link>
        </div>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold text-forest-900">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="mt-3 text-sm text-forest-700/90">No activity yet. Browse the catalog or check back after your first borrow.</p>
        ) : (
          <ul className="mt-3 divide-y divide-cream-300/80 rounded-xl border border-cream-300/80 bg-white/90">
            {activity.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${activityTone(item.kind)}`}>
                      {activityLabel(item.kind)}
                    </span>
                    <span className="text-xs text-forest-700/75">
                      {new Date(item.at).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  {item.href ? (
                    <Link href={item.href} className="mt-1 block font-medium text-forest-900 no-underline hover:underline">
                      {item.title}
                    </Link>
                  ) : (
                    <p className="mt-1 font-medium text-forest-900">{item.title}</p>
                  )}
                  {item.subtitle ? <p className="text-forest-700/85">{item.subtitle}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
