/**
 * CoolFTC — BYOK encryption helpers
 * packages/aria/src/byokCrypto.ts
 *
 * AES-256-GCM authenticated encryption for org-owned Anthropic API keys.
 * Uses BYOK_ENCRYPTION_KEY (32-byte base64 secret) as the master key.
 *
 * Stored format: {iv_hex}:{tag_hex}:{ciphertext_hex}
 *   iv         — 12 random bytes, per record
 *   tag        — 16-byte GCM auth tag
 *   ciphertext — encrypted API key
 *
 * Rotate BYOK_ENCRYPTION_KEY → re-encrypt all rows (not automated here —
 * run a one-off admin script if needed).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

let _masterKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (_masterKey) return _masterKey;
  const raw = process.env.BYOK_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "BYOK_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `BYOK_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). ` +
      `Regenerate with: openssl rand -base64 32`
    );
  }
  _masterKey = key;
  return key;
}

/** Encrypt a plaintext API key for storage in the DB. */
export function encryptApiKey(plaintext: string): string {
  if (!plaintext) throw new Error("Cannot encrypt empty string");
  const key = getMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

/** Decrypt a stored API key. Returns null if the stored value is malformed. */
export function decryptApiKey(encoded: string | null | undefined): string | null {
  if (!encoded) return null;
  const parts = encoded.split(":");
  if (parts.length !== 3) return null;
  try {
    const [ivHex, tagHex, ctHex] = parts;
    const key = getMasterKey();
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ctHex, "hex")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/** Lightweight sanity check — is the env var set and valid? */
export function isByokConfigured(): boolean {
  try { getMasterKey(); return true; }
  catch { return false; }
}

/** For showing users a masked preview without revealing the key. */
export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 12) return "••••";
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}
