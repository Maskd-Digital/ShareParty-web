import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { MyProfileEditor, type MyProfile } from "@/components/MyProfileEditor";

export default async function MyProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRow } = await supabase
    .from("profiles")
    .select(
      "id,email,full_name,role,phone_number,date_of_birth,marketing_opt_in,notification_email,notification_push,terms_accepted_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  const role = profileRow?.role ?? "member";
  if (role !== "operator") redirect("/dashboard");

  const initial: MyProfile = {
    id: user.id,
    email: profileRow?.email ?? user.email ?? null,
    full_name: profileRow?.full_name ?? null,
    role: "operator",
    phone_number: profileRow?.phone_number ?? null,
    date_of_birth: profileRow?.date_of_birth ?? null,
    marketing_opt_in: profileRow?.marketing_opt_in ?? false,
    notification_email: profileRow?.notification_email ?? true,
    notification_push: profileRow?.notification_push ?? true,
    terms_accepted_at: profileRow?.terms_accepted_at ?? null,
  };

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
            <span className="block rounded-lg px-3 py-2 text-forest-800/85">Members</span>
            <Link
              href="/my-profile"
              className="block rounded-lg bg-forest-800 px-3 py-2 font-semibold text-cream-50 no-underline"
            >
              My profile
            </Link>
            <Link href="/library-settings" className="block rounded-lg px-3 py-2 text-forest-800/85 no-underline">
              Library settings
            </Link>
          </nav>
        </aside>

        <main className="rounded-2xl border border-cream-300/90 bg-cream-50/90 p-6 shadow-card sm:p-8">
          <MyProfileEditor initial={initial} />
        </main>
      </div>
    </AppShell>
  );
}

