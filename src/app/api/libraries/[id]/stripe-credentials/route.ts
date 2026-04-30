import { NextResponse } from "next/server";
import { assertLibraryOperator } from "@/lib/authz";
import { encryptSecret, isEncryptionConfigured } from "@/lib/encryption";
import {
  fingerprintShort,
  hashStripeCredential,
  looksLikeStripePublishableKey,
  looksLikeStripeSecretKey,
  looksLikeStripeWebhookSecret,
} from "@/lib/stripeCredentials";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LibraryStripeRow = {
  stripe_account_id: string | null;
  stripe_publishable_key: string | null;
  stripe_secret_key_hash: string | null;
  stripe_webhook_signing_secret_hash: string | null;
};

/**
 * GET — metadata only (no ciphertext or raw secrets).
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: libraryId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await assertLibraryOperator(supabase, user.id, libraryId);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Forbidden" }, { status });
  }

  const { data: row, error } = await supabase
    .from("libraries")
    .select(
      "stripe_account_id,stripe_publishable_key,stripe_secret_key_hash,stripe_webhook_signing_secret_hash",
    )
    .eq("id", libraryId)
    .maybeSingle();

  if (error || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const r = row as LibraryStripeRow;

  return NextResponse.json({
    stripe_account_id: r.stripe_account_id,
    publishable_key: r.stripe_publishable_key,
    secret_key_configured: Boolean(r.stripe_secret_key_hash),
    secret_key_fingerprint: fingerprintShort(r.stripe_secret_key_hash),
    webhook_signing_configured: Boolean(r.stripe_webhook_signing_secret_hash),
    webhook_signing_fingerprint: fingerprintShort(r.stripe_webhook_signing_secret_hash),
  });
}

/**
 * POST — add/replace/clear Stripe keys. Secrets are encrypted (AES-256-GCM) + SHA-256 fingerprint stored.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: libraryId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await assertLibraryOperator(supabase, user.id, libraryId);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Forbidden" }, { status });
  }

  const body = (await request.json()) as {
    stripe_account_id?: string | null;
    publishable_key?: string | null;
    secret_key?: string;
    webhook_signing_secret?: string;
    clear_secret_key?: boolean;
    clear_webhook_signing_secret?: boolean;
  };

  const willStoreEncryptedSecret =
    (!body.clear_secret_key && body.secret_key !== undefined && body.secret_key.trim() !== "") ||
    (!body.clear_webhook_signing_secret && body.webhook_signing_secret !== undefined && body.webhook_signing_secret.trim() !== "");

  if (willStoreEncryptedSecret && !isEncryptionConfigured()) {
    return NextResponse.json(
      { error: "Server ENCRYPTION_KEY is not configured; cannot store Stripe secret keys." },
      { status: 503 },
    );
  }

  const patch: Record<string, unknown> = {};

  if (body.stripe_account_id !== undefined) {
    const v = body.stripe_account_id?.trim();
    patch.stripe_account_id = v ? v.slice(0, 255) : null;
  }

  if (body.publishable_key !== undefined) {
    const v = body.publishable_key?.trim();
    if (v && !looksLikeStripePublishableKey(v)) {
      return NextResponse.json({ error: "Publishable key must start with pk_" }, { status: 400 });
    }
    patch.stripe_publishable_key = v ? v.slice(0, 255) : null;
  }

  if (body.clear_secret_key) {
    patch.stripe_secret_key_ciphertext = null;
    patch.stripe_secret_key_hash = null;
  } else if (body.secret_key !== undefined && body.secret_key.trim() !== "") {
    const sk = body.secret_key.trim();
    if (!looksLikeStripeSecretKey(sk)) {
      return NextResponse.json({ error: "Secret key must start with sk_ or rk_" }, { status: 400 });
    }
    patch.stripe_secret_key_ciphertext = encryptSecret(sk);
    patch.stripe_secret_key_hash = hashStripeCredential(sk);
  }

  if (body.clear_webhook_signing_secret) {
    patch.stripe_webhook_signing_secret_ciphertext = null;
    patch.stripe_webhook_signing_secret_hash = null;
  } else if (body.webhook_signing_secret !== undefined && body.webhook_signing_secret.trim() !== "") {
    const wh = body.webhook_signing_secret.trim();
    if (!looksLikeStripeWebhookSecret(wh)) {
      return NextResponse.json({ error: "Webhook signing secret must start with whsec_" }, { status: 400 });
    }
    patch.stripe_webhook_signing_secret_ciphertext = encryptSecret(wh);
    patch.stripe_webhook_signing_secret_hash = hashStripeCredential(wh);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  const { error } = await supabase.from("libraries").update(patch).eq("id", libraryId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
