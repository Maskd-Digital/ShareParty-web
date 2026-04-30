import { createHash } from "crypto";

/** SHA-256 hex (64 chars). Used as a fingerprint only; never suitable for authentication by itself. */
export function hashStripeCredential(plain: string): string {
  return createHash("sha256").update(plain.trim(), "utf8").digest("hex");
}

export function fingerprintShort(fullSha256Hex: string | null): string | null {
  if (!fullSha256Hex || fullSha256Hex.length < 8) return null;
  return fullSha256Hex.slice(0, 8);
}

export function looksLikeStripeSecretKey(s: string): boolean {
  const t = s.trim();
  return t.startsWith("sk_") || t.startsWith("rk_");
}

export function looksLikeStripePublishableKey(s: string): boolean {
  return s.trim().startsWith("pk_");
}

export function looksLikeStripeWebhookSecret(s: string): boolean {
  return s.trim().startsWith("whsec_");
}
