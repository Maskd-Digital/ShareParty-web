import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { AppShell, AuthCard } from "@/components/AppShell";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-700/80">Onboarding</p>
          <h1 className="text-2xl font-bold text-forest-900">Finish setting up your library</h1>
        </div>
        <Link
          href="/dashboard"
          className="text-sm font-semibold text-forest-700 underline decoration-forest-600/30 underline-offset-2"
        >
          Dashboard
        </Link>
      </div>
      <AuthCard>
        <Suspense fallback={<p className="text-forest-700/80">Loading…</p>}>
          <OnboardingWizard />
        </Suspense>
      </AuthCard>
    </AppShell>
  );
}
