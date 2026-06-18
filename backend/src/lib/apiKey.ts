import { Request, Response, NextFunction } from "express";
import type { ApiKey } from "@prisma/client";
import { prisma } from "./prisma.js";
import { HttpError } from "./http.js";
import { isActive, parseApiKey, secretMatches } from "./apiKeys.js";

// Re-write lastUsedAt at most this often per key, to avoid an UPDATE per send.
const LAST_USED_THROTTLE_MS = 60_000;

function presentedKey(req: Request): string | undefined {
  const header = req.header("x-api-key");
  if (header) return header;
  const auth = req.header("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return undefined;
}

/**
 * Authenticates the send API against a database-backed API key.
 * On success, attaches the key to req.apiKey; the send handler enforces
 * per-template scope (it needs the resolved template id).
 */
export async function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  try {
    const raw = presentedKey(req);
    const parsed = raw ? parseApiKey(raw) : null;
    if (!parsed) throw new HttpError(401, "invalid_api_key");

    const key = await prisma.apiKey.findUnique({ where: { prefix: parsed.prefix } });
    if (!key || !secretMatches(parsed.secret, key.hashedKey)) {
      throw new HttpError(401, "invalid_api_key");
    }
    if (!isActive(key)) throw new HttpError(401, "api_key_inactive");

    (req as Request & { apiKey?: ApiKey }).apiKey = key;
    touchLastUsed(key); // fire-and-forget
    next();
  } catch (e) {
    next(e);
  }
}

function touchLastUsed(key: ApiKey) {
  const now = Date.now();
  if (key.lastUsedAt && now - key.lastUsedAt.getTime() < LAST_USED_THROTTLE_MS) return;
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date(now) } })
    .catch((e) => console.error("failed to update apiKey.lastUsedAt", e));
}
