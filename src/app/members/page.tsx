import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { MembersManager } from "@/components/MembersManager";

export default async function MembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRow } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profileRow?.role ?? "member";
  if (role !== "operator") redirect("/dashboard");

  const { data: libs } = await supabase.from("libraries").select("id,library_name").eq("owner_user_id", user.id).limit(1);
  const active = libs?.[0] ?? null;
  if (!active) redirect("/dashboard");

  return (
    <AppShell variant="dashboard">
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <aside className="rounded-2xl border border-cream-300/80 bg-cream-50/90 p-4 shadow-card">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-forest-700/75">Operator</p>
          <nav className="space-y-1 text-sm">
            <Link href="/dashboard" className="block rounded-lg px-3 py-2 text-forest-800/85 no-underline">
              Dashboard
            </Link>
            <Link href="/catalog" className="block rounded-lg px-3 py-2 text-forest-800/85 no-underline">
              Manage catalog
            </Link>
            <Link
              href="/members"
              className="block rounded-lg bg-forest-800 px-3 py-2 font-semibold text-cream-50 no-underline"
            >
              Members
            </Link>
            <Link href="/my-profile" className="block rounded-lg px-3 py-2 text-forest-800/85 no-underline">
              My profile
            </Link>
            <Link href="/library-settings" className="block rounded-lg px-3 py-2 text-forest-800/85 no-underline">
              Library settings
            </Link>
          </nav>
        </aside>

        <main className="rounded-2xl border border-cream-300/90 bg-cream-50/90 p-6 shadow-card sm:p-8">
          <MembersManager libraryId={active.id} libraryName={active.library_name} />
        </main>
      </div>
    </AppShell>
  );
}

