import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell, AuthCard } from "@/components/AppShell";

export default async function HomePage() {
  let user = null;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  return (
    <AppShell variant="auth">
      <AuthCard>
        <div className="mb-6 inline-flex rounded-full bg-leaf-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-forest-800">
          ShareParty
        </div>
        <h1 className="text-balance text-3xl font-bold tracking-tight text-forest-900">Toy libraries, calmly run.</h1>
        <p className="mt-4 text-pretty text-sm leading-relaxed text-forest-800/85">
          Operator console for catalogues, loans, members, and payments — built for community libraries and pilots.
        </p>
        {user ? (
          <div className="mt-10 flex flex-col gap-3">
            <p className="text-sm text-forest-800/90">
              Signed in as <span className="font-semibold text-forest-900">{user.email}</span>
            </p>
            <Link href="/dashboard" className="btn-primary text-center no-underline">
              Dashboard
            </Link>
            <Link
              href="/onboarding"
              className="btn-secondary text-center no-underline"
            >
              Continue onboarding
            </Link>
          </div>
        ) : (
          <div className="mt-10 flex flex-col gap-3">
            <Link href="/signup" className="btn-primary text-center no-underline">
              Sign up
            </Link>
            <Link href="/login" className="btn-secondary text-center no-underline">
              Log in
            </Link>
          </div>
        )}
      </AuthCard>
    </AppShell>
  );
}
