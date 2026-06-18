import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Raw key shape: es_<prefix>_<secret>, all hex so "_" is an unambiguous delimiter.
const KEY_RE = /^es_([0-9a-f]+)_([0-9a-f]+)$/;

export type GeneratedKey = {
  raw: string; // shown to the user exactly once
  prefix: string; // stored plaintext, indexed, used for lookup
  hashedKey: string; // sha256(secret), the only secret-derived value persisted
  hint: string; // masked display, e.g. "es_a1b2c3d4…9f0a"
};

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function generateApiKey(): GeneratedKey {
  const prefix = randomBytes(4).toString("hex"); // 8 hex chars
  const secret = randomBytes(24).toString("hex"); // 48 hex chars (192-bit)
  const raw = `es_${prefix}_${secret}`;
  return {
    raw,
    prefix,
    hashedKey: sha256(secret),
    hint: `es_${prefix}…${secret.slice(-4)}`,
  };
}

export type ParsedKey = { prefix: string; secret: string };

export function parseApiKey(raw: string): ParsedKey | null {
  const m = KEY_RE.exec(raw.trim());
  return m ? { prefix: m[1], secret: m[2] } : null;
}

// Constant-time check of a presented secret against the stored hash.
export function secretMatches(secret: string, hashedKey: string): boolean {
  const a = Buffer.from(sha256(secret));
  const b = Buffer.from(hashedKey);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isActive(key: { revokedAt: Date | null; expiresAt: Date | null }, now = new Date()): boolean {
  if (key.revokedAt) return false;
  if (key.expiresAt && key.expiresAt <= now) return false;
  return true;
}
