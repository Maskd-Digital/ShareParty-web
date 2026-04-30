-- Encrypted Stripe credentials per library (secret keys never stored in plaintext).
-- stripe_*_hash = SHA-256 hex (64 chars) for fingerprint display only.

BEGIN;

ALTER TABLE public.libraries
  ADD COLUMN IF NOT EXISTS stripe_publishable_key text
    CHECK (stripe_publishable_key IS NULL OR char_length(stripe_publishable_key) <= 255);

ALTER TABLE public.libraries
  ADD COLUMN IF NOT EXISTS stripe_secret_key_ciphertext text;

ALTER TABLE public.libraries
  ADD COLUMN IF NOT EXISTS stripe_secret_key_hash text
    CHECK (stripe_secret_key_hash IS NULL OR char_length(stripe_secret_key_hash) = 64);

ALTER TABLE public.libraries
  ADD COLUMN IF NOT EXISTS stripe_webhook_signing_secret_ciphertext text;

ALTER TABLE public.libraries
  ADD COLUMN IF NOT EXISTS stripe_webhook_signing_secret_hash text
    CHECK (
      stripe_webhook_signing_secret_hash IS NULL OR char_length(stripe_webhook_signing_secret_hash) = 64
    );

COMMIT;
