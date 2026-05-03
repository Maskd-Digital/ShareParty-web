import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";

type LoanRow = { id: string; item_id: string; due_date: string; library_id: string };

export default async function MyReturnsPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: loans } = await supabase
    .from("loans")
    .select("id,item_id,due_date,library_id")
    .eq("member_user_id", user.id)
    .in("status", ["active", "overdue"])
    .order("due_date", { ascending: true });

  const loanRows = (loans ?? []) as LoanRow[];
  const itemIds = Array.from(new Set(loanRows.map((l) => l.item_id)));
  let names = new Map<string, string>();
  if (itemIds.length) {
    const { data: items } = await supabase.from("library_items").select("id,name").in("id", itemIds);
    names = new Map((items ?? []).map((r) => [r.id as string, r.name as string]));
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold text-forest-900">My borrows</h1>
        <p className="mt-2 text-sm text-forest-800/85">
          When you are ready to return a toy, start a return inspection and upload the three required photos for the library
          operator.
        </p>

        {err ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50/90 px-3 py-2 text-sm text-red-800">
            {err.replace(/_/g, " ")}
          </p>
        ) : null}

        {loanRows.length === 0 ? (
          <p className="mt-8 text-sm text-forest-700/85">You have no active loans.</p>
        ) : (
          <ul className="mt-8 space-y-3">
            {loanRows.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cream-300/80 bg-cream-50/90 p-4 shadow-sm"
              >
                <div>
                  <p className="font-semibold text-forest-900">{names.get(l.item_id) ?? "Toy"}</p>
                  <p className="mt-1 text-xs text-forest-700/80">Due {new Date(l.due_date).toLocaleDateString()}</p>
                </div>
                <StartReturnButton itemId={l.item_id} />
              </li>
            ))}
          </ul>
        )}

        <p className="mt-10 text-sm text-forest-700/80">
          <Link href="/dashboard" className="font-semibold text-forest-800 underline decoration-forest-600/30 underline-offset-2">
            Back to dashboard
          </Link>
        </p>
      </div>
    </AppShell>
  );
}

function StartReturnButton({ itemId }: { itemId: string }) {
  return (
    <form action={`/returns/start?item=${encodeURIComponent(itemId)}`} method="get">
      <button type="submit" className="btn-primary text-sm">
        Start return photos
      </button>
    </form>
  );
}
