import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { OperatorSidebar } from "@/components/OperatorSidebar";
import { createClient } from "@/lib/supabase/server";
import { LibraryProfileEditor, type LibraryProfile } from "@/components/LibraryProfileEditor";
import { LibraryStripeSettings } from "@/components/LibraryStripeSettings";

export default async function LibrarySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRow } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profileRow?.role ?? "member";
  if (role !== "operator") redirect("/dashboard");

  const { data: libs } = await supabase
    .from("libraries")
    .select(
      "id,library_name,country,city,postal_code,phone_number,contact_email,description,street_address,suburb,requires_paid_membership,is_setls_member,max_items_per_member,loan_period_days,renewals_allowed,late_return_policy",
    )
    .eq("owner_user_id", user.id)
    .limit(1);

  const active = (libs?.[0] ?? null) as LibraryProfile | null;

  return (
    <AppShell variant="dashboard">
      <div className="grid gap-6 md:grid-cols-[240px_1fr] md:items-stretch">
        <OperatorSidebar active="library-settings" />

        <main className="rounded-2xl border border-cream-300/90 bg-cream-50/90 p-6 shadow-card sm:p-8">
          {!active ? (
            <section className="rounded-xl border border-dashed border-forest-500/40 bg-cream-100/60 p-6">
              <h1 className="text-2xl font-bold text-forest-900">Create your library</h1>
              <p className="mt-2 text-sm text-forest-800/85">
                No library exists yet. Create one to start managing toys, members, and loans.
              </p>
              <Link href="/onboarding?step=settings" className="btn-primary mt-5 inline-block no-underline">
                Create library
              </Link>
            </section>
          ) : (
            <>
              <LibraryProfileEditor initial={active} />
              <LibraryStripeSettings libraryId={active.id} />
            </>
          )}
        </main>
      </div>
    </AppShell>
  );
}

