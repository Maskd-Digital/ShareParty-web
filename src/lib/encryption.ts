import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const SALT = "shareparty-stripe-v1";

function keyFromEnv(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 8) {
    throw new Error("ENCRYPTION_KEY must be set (e.g. openssl rand -base64 32)");
  }
  return scryptSync(raw, SALT, 32);
}

export function isEncryptionConfigured(): boolean {
  const raw = process.env.ENCRYPTION_KEY;
  return Boolean(raw && raw.length >= 8);
}

export function encryptSecret(plain: string): string {
  const key = keyFromEnv();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(ciphertextB64: string): string {
  const key = keyFromEnv();
  const buf = Buffer.from(ciphertextB64, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const enc = buf.subarray(IV_LEN + 16);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
