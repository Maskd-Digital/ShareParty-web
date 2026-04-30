"use client";

import { useCallback, useEffect, useState } from "react";

type StripeState = {
  stripe_account_id: string | null;
  publishable_key: string | null;
  secret_key_configured: boolean;
  secret_key_fingerprint: string | null;
  webhook_signing_configured: boolean;
  webhook_signing_fingerprint: string | null;
};

export function LibraryStripeSettings({ libraryId }: { libraryId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [meta, setMeta] = useState<StripeState | null>(null);

  const [stripeAccountId, setStripeAccountId] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [clearSecret, setClearSecret] = useState(false);
  const [clearWebhook, setClearWebhook] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setSavedMsg(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/libraries/${libraryId}/stripe-credentials`);
      const j = (await res.json()) as StripeState & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to load");
      setMeta(j);
      setStripeAccountId(j.stripe_account_id ?? "");
      setPublishableKey(j.publishable_key ?? "");
      setSecretKey("");
      setWebhookSecret("");
      setClearSecret(false);
      setClearWebhook(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [libraryId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setError(null);
    setSavedMsg(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        stripe_account_id: stripeAccountId.trim() || null,
        publishable_key: publishableKey.trim() || null,
      };
      if (secretKey.trim()) {
        payload.secret_key = secretKey.trim();
      } else if (clearSecret) {
        payload.clear_secret_key = true;
      }
      if (webhookSecret.trim()) {
        payload.webhook_signing_secret = webhookSecret.trim();
      } else if (clearWebhook) {
        payload.clear_webhook_signing_secret = true;
      }

      const res = await fetch(`/api/libraries/${libraryId}/stripe-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to save");
      setSavedMsg("Stripe settings saved.");
      setSecretKey("");
      setWebhookSecret("");
      setClearSecret(false);
      setClearWebhook(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-10 border-t border-cream-300/80 pt-8">
      <h2 className="text-xl font-bold text-forest-900">Stripe</h2>
      <p className="mt-1 text-sm text-forest-800/85">
        Connect account id and API keys. Secret keys are stored encrypted; we also keep a SHA-256 fingerprint so you can
        confirm a key is on file without exposing the value.
      </p>
      <p className="mt-2 text-xs text-forest-700/80">
        Set <code className="rounded bg-cream-200/80 px-1">ENCRYPTION_KEY</code> on the server to enable saving secret and
        webhook keys.
      </p>

      {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
      {savedMsg ? <p className="mt-2 text-sm font-medium text-forest-800">{savedMsg}</p> : null}

      {loading ? (
        <p className="mt-4 text-sm text-forest-700/80">Loading…</p>
      ) : (
        <div className="mt-4 grid max-w-2xl gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
            Stripe Connect account ID
            <input
              className="input-cream"
              value={stripeAccountId}
              onChange={(e) => setStripeAccountId(e.target.value)}
              placeholder="acct_…"
              autoComplete="off"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-forest-900">
            Publishable key
            <input
              className="input-cream"
              value={publishableKey}
              onChange={(e) => setPublishableKey(e.target.value)}
              placeholder="pk_live_… or pk_test_…"
              autoComplete="off"
            />
            <span className="text-xs font-normal text-forest-700/75">Safe to store; used in client-side Stripe.js.</span>
          </label>

          <div className="rounded-xl border border-cream-300/80 bg-cream-100/50 p-4">
            <p className="text-sm font-semibold text-forest-900">Secret key</p>
            {meta?.secret_key_configured && meta.secret_key_fingerprint ? (
              <p className="mt-1 text-xs text-forest-700/80">
                A secret key is on file. Fingerprint (SHA-256 prefix):{" "}
                <span className="font-mono font-semibold">{meta.secret_key_fingerprint}</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-forest-700/80">No secret key stored yet.</p>
            )}
            <input
              className="input-cream mt-2"
              type="password"
              value={secretKey}
              onChange={(e) => {
                setSecretKey(e.target.value);
                if (e.target.value) setClearSecret(false);
              }}
              placeholder={meta?.secret_key_configured ? "New sk_… to replace" : "sk_live_… or sk_test_…"}
              autoComplete="off"
            />
            {meta?.secret_key_configured ? (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-forest-800">
                <input
                  type="checkbox"
                  className="accent-forest-700"
                  checked={clearSecret}
                  onChange={(e) => {
                    setClearSecret(e.target.checked);
                    if (e.target.checked) setSecretKey("");
                  }}
                />
                Remove stored secret key
              </label>
            ) : null}
          </div>

          <div className="rounded-xl border border-cream-300/80 bg-cream-100/50 p-4">
            <p className="text-sm font-semibold text-forest-900">Webhook signing secret</p>
            {meta?.webhook_signing_configured && meta.webhook_signing_fingerprint ? (
              <p className="mt-1 text-xs text-forest-700/80">
                A signing secret is on file. Fingerprint:{" "}
                <span className="font-mono font-semibold">{meta.webhook_signing_fingerprint}</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-forest-700/80">No webhook signing secret stored.</p>
            )}
            <input
              className="input-cream mt-2"
              type="password"
              value={webhookSecret}
              onChange={(e) => {
                setWebhookSecret(e.target.value);
                if (e.target.value) setClearWebhook(false);
              }}
              placeholder={meta?.webhook_signing_configured ? "New whsec_… to replace" : "whsec_… (optional)"}
              autoComplete="off"
            />
            {meta?.webhook_signing_configured ? (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-forest-800">
                <input
                  type="checkbox"
                  className="accent-forest-700"
                  checked={clearWebhook}
                  onChange={(e) => {
                    setClearWebhook(e.target.checked);
                    if (e.target.checked) setWebhookSecret("");
                  }}
                />
                Remove stored webhook signing secret
              </label>
            ) : null}
          </div>

          <button type="button" className="btn-primary w-fit" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save Stripe settings"}
          </button>
        </div>
      )}
    </section>
  );
}
