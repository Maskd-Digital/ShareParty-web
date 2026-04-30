"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { createClient } from "@/lib/supabase/client";
import { AppShell, AuthCard } from "@/components/AppShell";

export default function LoginPage() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
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
            <h1 className="text-xl font-bold text-forest-900">{t("loginTitle")}</h1>
          </div>
        </div>

        <form className="flex flex-col gap-5" onSubmit={onSubmit}>
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "…" : t("submitLogin")}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-forest-800/75">
          {t("signupTitle")}?{" "}
          <Link
            href="/signup"
            className="font-semibold text-forest-700 underline decoration-forest-600/40 underline-offset-2 hover:text-forest-900"
          >
            Get started
          </Link>
        </p>
      </AuthCard>
    </AppShell>
  );
}
