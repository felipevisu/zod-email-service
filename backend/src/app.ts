import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "./lib/http.js";
import { requireUser } from "./lib/auth.js";
import { auth } from "./routes/auth.js";
import { apiKeys } from "./routes/apiKeys.js";
import { senders } from "./routes/senders.js";
import { categories } from "./routes/categories.js";
import { templates } from "./routes/templates.js";
import { versions } from "./routes/versions.js";
import { logs } from "./routes/logs.js";
import { send } from "./routes/send.js";

export function createApp() {
  const app = express();
  app.use(cors({ credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Auth endpoints (login/logout are open; /me self-checks the session).
  app.use("/api/auth", auth);

  // Everything else under /api requires a logged-in user (the UI).
  app.use("/api", requireUser);
  app.use("/api/api-keys", apiKeys);
  app.use("/api/senders", senders);
  app.use("/api/categories", categories);
  app.use("/api/templates", templates);
  app.use("/api/logs", logs);
  app.use("/api", versions); // /api/templates/:id/versions, /api/versions/:id, ...

  // Public send API (consumed by internal services): /:category/:template/:version.
  // The send route itself is gated by a shared API key (see routes/send.ts).
  app.use("/", send);

  app.use(errorMiddleware);
  return app;
}
