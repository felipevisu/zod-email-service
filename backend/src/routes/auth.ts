import { Router } from "express";
import { z } from "zod";
import { h, HttpError } from "../lib/http.js";
import {
  SESSION_COOKIE,
  cookieOptions,
  requireUser,
  signSession,
  verifyCredentials,
} from "../lib/auth.js";

export const auth = Router();

const loginInput = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// POST /api/auth/login — exchange credentials for a session cookie.
auth.post(
  "/login",
  h(async (req, res) => {
    const { username, password } = loginInput.parse(req.body);
    const user = await verifyCredentials(username, password);
    if (!user) throw new HttpError(401, "invalid_credentials");
    const token = await signSession(user);
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    res.json({ username: user.username });
  })
);

// POST /api/auth/logout — clear the session cookie.
auth.post(
  "/logout",
  h(async (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
    res.status(204).end();
  })
);

// GET /api/auth/me — current session, used by the UI to bootstrap auth state.
auth.get(
  "/me",
  requireUser,
  h(async (req, res) => {
    res.json({ username: (req as typeof req & { user?: { username: string } }).user?.username });
  })
);
