"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { formatMembershipFee } from "@/lib/formatMoney";

export function MemberPaymentClient({
  libraryId,
  libraryName,
  feeAmount,
  feeCurrency,
  cancelled,
}: {
  libraryId: string;
  libraryName: string;
  feeAmount: number;
  feeCurrency: string;
  cancelled?: boolean;
}) {
  const { t } = useTranslation("member");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/membership/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ library_id: libraryId }),
      });
      const j = (await res.json()) as { error?: string; url?: string };
      if (!res.ok) throw new Error(j.error ?? "Checkout failed");
      if (j.url) window.location.href = j.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <h1 className="text-2xl font-bold text-forest-900">{t("paymentRequired")}</h1>
      <p className="text-sm text-forest-800/85">
        Complete payment to join <span className="font-semibold">{libraryName}</span>.
      </p>
      <p className="rounded-xl border border-cream-300/80 bg-cream-100/60 px-4 py-3 text-lg font-semibold text-forest-900">
        {formatMembershipFee(feeAmount, feeCurrency)}
      </p>
      {cancelled ? <p className="text-sm text-amber-800">Payment was cancelled. You can try again.</p> : null}
      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
      <button type="button" className="btn-primary w-full" disabled={loading} onClick={() => void startCheckout()}>
        {loading ? "Redirecting…" : t("payAndJoin")}
      </button>
      <button type="button" className="btn-secondary w-full" onClick={() => router.push("/dashboard")}>
        Back to dashboard
      </button>
    </div>
  );
}

export function MemberPaymentCompleteClient({ libraryId }: { libraryId: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  async function check() {
    const res = await fetch(`/api/membership-requests?library_id=`);
    void res;
    router.push("/member/catalog");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 text-center">
      <h1 className="text-2xl font-bold text-forest-900">Payment received</h1>
      <p className="text-sm text-forest-800/85">Thank you. Setting up your membership…</p>
      <button
        type="button"
        className="btn-primary"
        disabled={checking}
        onClick={() => {
          setChecking(true);
          router.push(`/member/catalog?library_id=${encodeURIComponent(libraryId)}`);
          router.refresh();
        }}
      >
        {checking ? "Continue to catalog" : "Continue"}
      </button>
    </div>
  );
}
