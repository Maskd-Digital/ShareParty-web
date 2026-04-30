import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";

export default async function CatalogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRow } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profileRow?.role ?? "member";
  if (role !== "operator") redirect("/dashboard");

  return (
    <AppShell variant="dashboard">
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <aside className="rounded-2xl border border-cream-300/80 bg-cream-50/90 p-4 shadow-card">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-forest-700/75">Operator</p>
          <nav className="space-y-1 text-sm">
            <Link href="/dashboard" className="block rounded-lg px-3 py-2 text-forest-800/85 no-underline">
              Dashboard
            </Link>
            <Link href="/catalog" className="block rounded-lg bg-forest-800 px-3 py-2 font-semibold text-cream-50 no-underline">
              Manage catalog
            </Link>
            <span className="block rounded-lg px-3 py-2 text-forest-800/85">Members</span>
            <Link href="/my-profile" className="block rounded-lg px-3 py-2 text-forest-800/85 no-underline">
              My profile
            </Link>
            <Link href="/library-settings" className="block rounded-lg px-3 py-2 text-forest-800/85 no-underline">
              Library settings
            </Link>
          </nav>
        </aside>

        <main className="rounded-2xl border border-cream-300/90 bg-cream-50/90 p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-bold text-forest-900">Manage catalog</h1>
          <p className="mt-2 text-sm text-forest-800/85">
            Start a new intake using photo prompts that change by toy type.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/catalog/intake" className="btn-primary inline-block no-underline">
              New intake
            </Link>
          </div>
        </main>
      </div>
    </AppShell>
  );
}

