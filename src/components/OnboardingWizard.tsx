"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { createClient } from "@/lib/supabase/client";

type Step = "settings" | "payments" | "golive";

type LibraryRow = {
  id: string;
  library_name: string;
  country: string | null;
  city: string | null;
  postal_code: string | null;
  phone_number: string | null;
  contact_email: string | null;
  description: string | null;
  street_address: string | null;
  suburb: string | null;
  requires_paid_membership: boolean;
  stripe_account_id: string | null;
  is_setls_member: boolean;
  max_items_per_member: number;
  loan_period_days: number;
  renewals_allowed: boolean;
  late_return_policy: string | null;
};

export function OnboardingWizard() {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStep = useMemo((): Step => {
    const s = searchParams.get("step");
    if (s === "payments" || s === "golive") return s;
    return "settings";
  }, [searchParams]);

  const [step, setStep] = useState<Step>(initialStep);
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryRow | null>(null);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [description, setDescription] = useState("");
  const [requiresPaidMembership, setRequiresPaidMembership] = useState(false);
  const [isSetlsMember, setIsSetlsMember] = useState(false);
  const [maxItemsPerMember, setMaxItemsPerMember] = useState(3);
  const [loanPeriodDays, setLoanPeriodDays] = useState(14);
  const [renewalsAllowed, setRenewalsAllowed] = useState(false);
  const [lateReturnPolicy, setLateReturnPolicy] = useState("");
  const [stripeAccountId, setStripeAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshLibrary = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: lib } = await supabase
      .from("libraries")
      .select(
        "id,library_name,country,city,postal_code,phone_number,contact_email,description,street_address,suburb,requires_paid_membership,stripe_account_id,is_setls_member,max_items_per_member,loan_period_days,renewals_allowed,late_return_policy",
      )
      .eq("owner_user_id", user.id)
      .single();

    const lid = lib?.id;
    if (!lid) return;
    setLibraryId(lid);
    if (lib) {
      setLibrary(lib as LibraryRow);
      setName(lib.library_name);
      setCountry(lib.country ?? "");
      setCity(lib.city ?? "");
      setPostalCode(lib.postal_code ?? "");
      setPhoneNumber(lib.phone_number ?? "");
      setContactEmail(lib.contact_email ?? "");
      setStreetAddress(lib.street_address ?? "");
      setSuburb(lib.suburb ?? "");
      setDescription(lib.description ?? "");
      setRequiresPaidMembership(lib.requires_paid_membership);
      setStripeAccountId(lib.stripe_account_id ?? "");
      setIsSetlsMember(Boolean(lib.is_setls_member));
      setMaxItemsPerMember(typeof lib.max_items_per_member === "number" ? lib.max_items_per_member : 3);
      setLoanPeriodDays(typeof lib.loan_period_days === "number" ? lib.loan_period_days : 14);
      setRenewalsAllowed(Boolean(lib.renewals_allowed));
      setLateReturnPolicy(lib.late_return_policy ?? "");
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    const s = searchParams.get("step");
    if (s === "payments" || s === "golive") {
      if (!libraryId) {
        setStep("settings");
        return;
      }
      setStep(s);
    }
  }, [searchParams, libraryId]);

  async function submitSettings(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (libraryId) {
        const res = await fetch(`/api/libraries/${libraryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            library_name: name,
            country,
            city,
            postal_code: postalCode,
            phone_number: phoneNumber,
            contact_email: contactEmail,
            street_address: streetAddress,
            suburb,
            description,
            requires_paid_membership: requiresPaidMembership,
            is_setls_member: isSetlsMember,
            max_items_per_member: maxItemsPerMember,
            loan_period_days: loanPeriodDays,
            renewals_allowed: renewalsAllowed,
            late_return_policy: lateReturnPolicy,
          }),
        });
        if (!res.ok) {
          const j = (await res.json()) as { error?: string };
          throw new Error(j.error ?? "Failed to update library");
        }
        await refreshLibrary();
      } else {
        const res = await fetch("/api/libraries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            library_name: name,
            country,
            city,
            postal_code: postalCode,
            phone_number: phoneNumber,
            contact_email: contactEmail,
            street_address: streetAddress,
            suburb,
            description,
            requires_paid_membership: requiresPaidMembership,
            is_setls_member: isSetlsMember,
            max_items_per_member: maxItemsPerMember,
            loan_period_days: loanPeriodDays,
            renewals_allowed: renewalsAllowed,
            late_return_policy: lateReturnPolicy,
          }),
        });
        const json = (await res.json()) as { libraryId?: string; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed");
        setLibraryId(json.libraryId ?? null);
        await refreshLibrary();
      }

      // If paid membership is required, go to Stripe onboarding; otherwise go straight to "complete".
      if (requiresPaidMembership) {
        setStep("payments");
        router.replace("/onboarding?step=payments");
      } else {
        setStep("golive");
        router.replace("/onboarding?step=golive");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function startStripeConnect() {
    if (!libraryId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/connect/account-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libraryId }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Stripe error");
      if (json.url) window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function goLive() {
    if (!libraryId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/libraries/${libraryId}/complete`, { method: "POST" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Cannot complete");
      await refreshLibrary();
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <nav className="flex flex-wrap items-center gap-2 text-xs font-medium text-forest-700/75 sm:text-sm">
        <StepLabel active={step === "settings"} label={t("stepSettings")} />
        <span className="text-cream-400">/</span>
        <StepLabel active={step === "payments"} label={t("stepPayments")} />
        <span className="text-cream-400">/</span>
        <StepLabel active={step === "golive"} label={t("stepGoLive")} />
      </nav>

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

      {step === "settings" && (
        <form className="space-y-5" onSubmit={(e) => void submitSettings(e)}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-forest-800">{t("stepSettings")}</h2>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
            {t("libraryName")}
            <input className="input-cream" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
              Country
              <input className="input-cream" value={country} onChange={(e) => setCountry(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
              City
              <input className="input-cream" value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
              Postal code
              <input className="input-cream" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
              Phone number
              <input className="input-cream" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900 sm:col-span-2">
              Contact email
              <input className="input-cream" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900 sm:col-span-2">
              Street address
              <input className="input-cream" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900 sm:col-span-2">
              Suburb
              <input className="input-cream" value={suburb} onChange={(e) => setSuburb(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900 sm:col-span-2">
              Description
              <textarea className="input-cream min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cream-300/90 bg-cream-100/50 p-3 text-sm text-forest-900">
            <input
              type="checkbox"
              className="mt-1 accent-forest-700"
              checked={requiresPaidMembership}
              onChange={(e) => setRequiresPaidMembership(e.target.checked)}
            />
            <span>Requires paid membership</span>
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cream-300/90 bg-cream-100/50 p-3 text-sm text-forest-900 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-1 accent-forest-700"
                checked={isSetlsMember}
                onChange={(e) => setIsSetlsMember(e.target.checked)}
              />
              <span>SETLS member</span>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
              Max items per member
              <input
                className="input-cream"
                type="number"
                min={1}
                value={maxItemsPerMember}
                onChange={(e) => setMaxItemsPerMember(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
              Loan period (days)
              <input
                className="input-cream"
                type="number"
                min={1}
                value={loanPeriodDays}
                onChange={(e) => setLoanPeriodDays(Number(e.target.value))}
              />
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cream-300/90 bg-cream-100/50 p-3 text-sm text-forest-900 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-1 accent-forest-700"
                checked={renewalsAllowed}
                onChange={(e) => setRenewalsAllowed(e.target.checked)}
              />
              <span>Renewals allowed</span>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900 sm:col-span-2">
              Late return policy (optional)
              <textarea className="input-cream min-h-20" value={lateReturnPolicy} onChange={(e) => setLateReturnPolicy(e.target.value)} />
            </label>
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            {libraryId ? "Continue" : "Create library"}
          </button>
        </form>
      )}

      {step === "payments" && (
        <div className="space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-forest-800">{t("stepPayments")}</h2>
          <div className="rounded-xl border border-cream-300/80 bg-cream-100/60 p-4">
            <p className="text-sm font-semibold text-forest-900">Stripe setup</p>
            <p className="mt-1 text-xs leading-relaxed text-forest-800/80">
              Required for paid memberships. You can skip temporarily, but you’ll need to add it later before completing setup.
            </p>

            {library?.stripe_account_id ? (
              <div className="mt-3 rounded-lg border border-leaf-500/30 bg-leaf-500/10 p-3 text-sm text-forest-900">
                Stripe configured.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
                  Stripe account id / key
                  <input
                    className="input-cream"
                    value={stripeAccountId}
                    onChange={(e) => setStripeAccountId(e.target.value)}
                    placeholder="e.g. acct_123…"
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={loading || !libraryId}
                    onClick={async () => {
                      if (!libraryId) return;
                      setError(null);
                      setLoading(true);
                      try {
                        const res = await fetch(`/api/libraries/${libraryId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ stripe_account_id: stripeAccountId.trim() || null }),
                        });
                        const j = (await res.json()) as { error?: string };
                        if (!res.ok) throw new Error(j.error ?? "Failed to save Stripe details");
                        await refreshLibrary();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Error");
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={loading}
                    onClick={() => {
                      setStep("golive");
                      router.replace("/onboarding?step=golive");
                    }}
                  >
                    Skip for now
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="text-sm font-semibold text-forest-700 underline decoration-forest-600/30 underline-offset-2"
            onClick={() => setStep("settings")}
          >
            Back
          </button>
        </div>
      )}

      {step === "golive" && (
        <div className="space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-forest-800">{t("stepGoLive")}</h2>
          <p className="text-sm leading-relaxed text-forest-800/85">
            {t("goLiveDone")}
          </p>
          <button type="button" disabled={loading} onClick={() => void goLive()} className="btn-primary">
            {t("complete")}
          </button>
        </div>
      )}
    </div>
  );
}

function StepLabel({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={
        active ? "rounded-full bg-forest-800 px-2.5 py-1 text-cream-50" : "rounded-full px-2.5 py-1 text-forest-700/70"
      }
    >
      {label}
    </span>
  );
}
