"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { formatMembershipFee } from "@/lib/formatMoney";

type JoinCard = {
  id: string;
  library_name: string;
  city: string | null;
  country: string | null;
  description: string | null;
  requires_paid_membership: boolean;
  membership_fee_amount: number;
  membership_fee_currency: string;
};

type Step = 1 | 2 | 3 | "done";

export function MemberOnboardingWizard({
  initialFullName,
  initialPhone,
  initialDob,
}: {
  initialFullName: string | null;
  initialPhone: string | null;
  initialDob: string | null;
}) {
  const { t } = useTranslation("member");
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [dob, setDob] = useState(initialDob ?? "");
  const [marketing, setMarketing] = useState(false);
  const [terms, setTerms] = useState(false);

  const [libraryId, setLibraryId] = useState("");
  const [joinCard, setJoinCard] = useState<JoinCard | null>(null);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function saveProfile() {
    if (!terms) {
      setError("Please accept the terms to continue.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim() || null,
          phone_number: phone.trim() || null,
          date_of_birth: dob.trim() || null,
          marketing_opt_in: marketing,
          terms_accepted_at: new Date().toISOString(),
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to save");
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function lookupLibrary() {
    const id = libraryId.trim();
    if (!id) return;
    setSaving(true);
    setError(null);
    setJoinCard(null);
    try {
      const res = await fetch(`/api/libraries/lookup?library_id=${encodeURIComponent(id)}`);
      const j = (await res.json()) as { error?: string; library?: JoinCard };
      if (!res.ok) throw new Error(j.error ?? "Library not found");
      setJoinCard(j.library ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function submitJoinRequest() {
    if (!joinCard) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/membership-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          library_id: joinCard.id,
          phone_number: phone.trim() || null,
          note: note.trim() || null,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to submit");
      setSubmitted(true);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-forest-900">{t("onboardingTitle")}</h1>
        <p className="mt-1 text-sm text-forest-800/85">
          Step {step === "done" ? 3 : step} of 3
        </p>
      </div>

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

      {step === 1 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-forest-900">{t("stepProfile")}</h2>
          <label className="flex flex-col gap-1 text-sm font-medium text-forest-900">
            Full name
            <input className="input-cream" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-forest-900">
            Phone
            <input className="input-cream" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-forest-900">
            Date of birth
            <input className="input-cream" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm text-forest-900">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
            Marketing opt-in
          </label>
          <label className="flex items-center gap-2 text-sm text-forest-900">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            I accept the terms
          </label>
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void saveProfile()}>
            Continue
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-forest-900">{t("stepChildren")}</h2>
          <p className="text-sm text-forest-800/85">You can add children now or skip and manage them later.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => router.push("/member/children")}>
              Manage children
            </button>
            <button type="button" className="btn-primary" onClick={() => setStep(3)}>
              Skip / Continue
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 && !submitted ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-forest-900">{t("stepJoin")}</h2>
          <label className="flex flex-col gap-1 text-sm font-medium text-forest-900">
            {t("libraryIdLabel")}
            <input className="input-cream font-mono text-sm" value={libraryId} onChange={(e) => setLibraryId(e.target.value)} />
            <span className="text-xs font-normal text-forest-700/80">{t("libraryIdHelp")}</span>
          </label>
          <button type="button" className="btn-secondary" disabled={saving || !libraryId.trim()} onClick={() => void lookupLibrary()}>
            {t("lookupLibrary")}
          </button>
          {joinCard ? (
            <div className="rounded-xl border border-cream-300/80 bg-cream-100/60 p-4 text-sm">
              <p className="font-semibold text-forest-900">{joinCard.library_name}</p>
              <p className="text-forest-800/85">
                {[joinCard.city, joinCard.country].filter(Boolean).join(", ") || "—"}
              </p>
              {joinCard.description ? <p className="mt-2 text-forest-800/90">{joinCard.description}</p> : null}
              {joinCard.requires_paid_membership ? (
                <p className="mt-2 font-medium text-forest-900">
                  {t("membershipFee")}:{" "}
                  {formatMembershipFee(joinCard.membership_fee_amount, joinCard.membership_fee_currency)}
                  <span className="block text-xs font-normal text-forest-700/80">{t("pendingApprovalPaid")}</span>
                </p>
              ) : null}
              <label className="mt-3 flex flex-col gap-1 font-medium text-forest-900">
                Note to operator (optional)
                <textarea className="input-cream min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button type="button" className="btn-primary mt-3" disabled={saving} onClick={() => void submitJoinRequest()}>
                {t("submitRequest")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === "done" ? (
        <div className="rounded-xl border border-forest-600/20 bg-forest-800/5 p-6 text-sm text-forest-900">
          <p className="font-semibold">{t("pendingApproval")}</p>
          <p className="mt-2 text-forest-800/85">
            {joinCard?.requires_paid_membership ? t("pendingApprovalPaid") : "You will be able to browse the catalog once approved."}
          </p>
          <button type="button" className="btn-secondary mt-4" onClick={() => router.push("/dashboard")}>
            Back to dashboard
          </button>
        </div>
      ) : null}
    </div>
  );
}
