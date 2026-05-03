import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { OperatorSidebar } from "@/components/OperatorSidebar";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRow } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profileRow?.role ?? "member";

  if (role !== "operator") {
    return (
      <AppShell>
        <div className="rounded-2xl border border-cream-300/90 bg-cream-50/90 p-8 shadow-card sm:p-10">
          <h1 className="text-2xl font-bold text-forest-900">Member</h1>
          <p className="mt-3 text-sm text-forest-800/85">
            Your account is set up. An operator will add you to a library when ready.
          </p>
          <p className="mt-6 text-sm text-forest-800/90">
            <Link href="/returns" className="btn-secondary inline-block no-underline">
              My borrows and returns
            </Link>
          </p>
          <form action="/auth/signout" method="post" className="mt-8">
            <button
              type="submit"
              className="text-sm font-medium text-forest-700 underline decoration-forest-600/30 underline-offset-2 hover:text-forest-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </AppShell>
    );
  }

  const { data: ownedLibraries } = await supabase
    .from("libraries")
    .select("id,library_name")
    .eq("owner_user_id", user.id)
    .limit(1);

  const activeLibrary = ownedLibraries?.[0] ?? null;
  const hasLibrary = Boolean(activeLibrary);

  let toyCount = 0;
  let memberCount = 0;
  let activeLoanCount = 0;
  let pendingRequestCount = 0;

  if (activeLibrary) {
    const [{ count: toys }, { count: members }, { count: activeLoans }, { count: pendingRequests }] = await Promise.all([
      supabase.from("library_items").select("*", { count: "exact", head: true }).eq("library_id", activeLibrary.id),
      supabase.from("memberships").select("*", { count: "exact", head: true }).eq("library_id", activeLibrary.id),
      supabase
        .from("loans")
        .select("*", { count: "exact", head: true })
        .eq("library_id", activeLibrary.id)
        .in("status", ["active", "overdue"]),
      supabase
        .from("loan_requests")
        .select("*", { count: "exact", head: true })
        .eq("library_id", activeLibrary.id)
        .eq("status", "pending"),
    ]);
    toyCount = toys ?? 0;
    memberCount = members ?? 0;
    activeLoanCount = activeLoans ?? 0;
    pendingRequestCount = pendingRequests ?? 0;
  }

  return (
    <AppShell variant="dashboard">
      <div className="grid gap-6 md:grid-cols-[240px_1fr] md:items-stretch">
        <OperatorSidebar active="dashboard" />

        <main className="rounded-2xl border border-cream-300/90 bg-cream-50/90 p-6 shadow-card sm:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-forest-900">Operator dashboard</h1>
            <p className="mt-1 text-sm text-forest-800/85">
              Signed in as <span className="font-semibold text-forest-900">{user.email}</span>
            </p>
          </div>

          {!hasLibrary ? (
            <section className="rounded-xl border border-dashed border-forest-500/40 bg-cream-100/60 p-6">
              <h2 className="text-lg font-semibold text-forest-900">Create your first library</h2>
              <p className="mt-2 text-sm text-forest-800/85">
                No library exists yet. Create one to start managing toys, members, and loans.
              </p>
              <Link href="/onboarding?step=settings" className="btn-primary mt-5 inline-block no-underline">
                Create library
              </Link>
            </section>
          ) : (
            <>
              <div className="mb-5 rounded-xl border border-cream-300/80 bg-cream-100/60 p-4">
                <p className="text-xs uppercase tracking-wide text-forest-700/70">Current library</p>
                <p className="mt-1 text-lg font-semibold text-forest-900">{activeLibrary?.library_name ?? "Library"}</p>
              </div>
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Toys" value={toyCount} />
                <StatCard label="Members" value={memberCount} />
                <StatCard label="Active loans" value={activeLoanCount} />
                <StatCard label="Pending requests" value={pendingRequestCount} />
              </section>
            </>
          )}
        </main>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-cream-300/80 bg-cream-100/60 p-4">
      <p className="text-xs uppercase tracking-wide text-forest-700/70">{label}</p>
      <p className="mt-1 text-2xl font-bold text-forest-900">{value}</p>
    </div>
  );
}
