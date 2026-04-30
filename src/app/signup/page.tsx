"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { createClient } from "@/lib/supabase/client";
import { AppShell, AuthCard } from "@/components/AppShell";

type SignupStep = 1 | 2;

export default function SignupPage() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const [step, setStep] = useState<SignupStep>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"operator" | "member">("operator");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submitAll(_e: React.FormEvent) {
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const onboardingAfterSession = "/dashboard";
      const onboardingAfterEmail = "/dashboard";
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(onboardingAfterEmail)}&signup_role=${encodeURIComponent(role)}`,
        },
      });
      if (err) {
        setError(err.message);
        return;
      }

      if (data.session) {
        await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        router.push(onboardingAfterSession);
        router.refresh();
        return;
      }

      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AppShell variant="auth">
        <AuthCard>
          <div className="mb-2 inline-flex rounded-full bg-leaf-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-forest-800">
            {t("brandBadge")}
          </div>
          <h1 className="text-balance text-2xl font-bold text-forest-900">{t("checkEmail")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-forest-800/85">{t("checkEmailOnboarding")}</p>
          <Link
            href="/login"
            className="btn-primary mt-8 inline-block w-full text-center no-underline"
          >
            {t("loginTitle")}
          </Link>
        </AuthCard>
      </AppShell>
    );
  }

  return (
    <AppShell variant="auth">
      <AuthCard>
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest-800 text-lg font-bold text-cream-50">
            S
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-forest-700/80">{t("brandBadge")}</p>
            <h1 className="text-xl font-bold text-forest-900">{t("signupTitle")}</h1>
          </div>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-forest-800/85">{t("signupSubtitle")}</p>

        <div className="mb-6 flex items-center gap-2">
          <div
            className={`h-2 flex-1 rounded-full ${step >= 1 ? "bg-forest-600" : "bg-cream-300"}`}
            aria-hidden
          />
          <div className={`h-2 flex-1 rounded-full ${step >= 2 ? "bg-forest-600" : "bg-cream-300"}`} aria-hidden />
        </div>
        <p className="mb-6 text-center text-xs font-medium text-forest-700/80">
          {t("stepIndicator", { current: step, total: 2 })}
        </p>

        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 1) {
              setStep(2);
              return;
            }
            void submitAll(e);
          }}
        >
          {step === 1 && (
            <>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-forest-800">Sign up as</h2>
              <div className="flex flex-col gap-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cream-300/90 bg-cream-100/50 p-3 text-sm text-forest-900">
                  <input
                    type="radio"
                    className="mt-1 accent-forest-700"
                    name="role"
                    value="operator"
                    checked={role === "operator"}
                    onChange={() => setRole("operator")}
                  />
                  <span>Operator (runs a library)</span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cream-300/90 bg-cream-100/50 p-3 text-sm text-forest-900">
                  <input
                    type="radio"
                    className="mt-1 accent-forest-700"
                    name="role"
                    value="member"
                    checked={role === "member"}
                    onChange={() => setRole("member")}
                  />
                  <span>Member</span>
                </label>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-forest-800">{t("signupStep1Title")}</h2>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
                {t("email")}
                <input
                  className="input-cream"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
                {t("password")}
                <input
                  className="input-cream"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </label>
            </>
          )}

          {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

          <div className="flex flex-col gap-3 pt-2">
            {step === 2 ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <button
                  type="button"
                  className="btn-secondary sm:flex-1"
                  onClick={() => setStep(1)}
                  disabled={loading}
                >
                  {t("back")}
                </button>
                <button type="submit" className="btn-primary sm:flex-[2]" disabled={loading}>
                  {loading ? "…" : "Create account"}
                </button>
              </div>
            ) : (
              <button type="submit" className="btn-primary" disabled={loading}>
                {t("continueToLibrary")}
              </button>
            )}
          </div>
        </form>

        <p className="mt-8 text-center text-sm text-forest-800/75">
          {t("loginTitle")}?{" "}
          <Link href="/login" className="font-semibold text-forest-700 underline decoration-forest-600/40 underline-offset-2 hover:text-forest-900">
            Log in
          </Link>
        </p>
      </AuthCard>
    </AppShell>
  );
}
