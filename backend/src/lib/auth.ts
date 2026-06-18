import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { HttpError } from "./http.js";

export const SESSION_COOKIE = "session";
const SESSION_TTL = "7d";

// HMAC key for signing session JWTs. Required in production.
function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new HttpError(500, "auth_misconfigured", { missing: "JWT_SECRET" });
  return new TextEncoder().encode(s);
}

export type SessionUser = { username: string };

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.username === "string" ? { username: payload.username } : null;
  } catch {
    return null;
  }
}

// Validates a login attempt against the env-configured admin credentials.
export async function verifyCredentials(username: string, password: string): Promise<SessionUser | null> {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminHash = process.env.ADMIN_PASSWORD_HASH;
  if (!adminUsername || !adminHash) {
    throw new HttpError(500, "auth_misconfigured", { missing: "ADMIN_USERNAME / ADMIN_PASSWORD_HASH" });
  }
  // Always run bcrypt to keep timing uniform whether or not the username matches.
  const ok = await bcrypt.compare(password, adminHash);
  if (username.toLowerCase() !== adminUsername.toLowerCase() || !ok) return null;
  return { username: adminUsername };
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

// Gate for the management API: requires a valid session cookie.
export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
    const user = token ? await verifySession(token) : null;
    if (!user) throw new HttpError(401, "unauthenticated");
    (req as Request & { user?: SessionUser }).user = user;
    next();
  } catch (e) {
    next(e);
  }
}
