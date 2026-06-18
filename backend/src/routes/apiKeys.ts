import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { h, HttpError } from "../lib/http.js";
import { generateApiKey } from "../lib/apiKeys.js";

export const apiKeys = Router();

// Never expose hashedKey. This is the shape returned to the dashboard.
const PUBLIC_SELECT = {
  id: true,
  name: true,
  prefix: true,
  hint: true,
  scope: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  createdBy: true,
  createdAt: true,
  templates: { select: { template: { select: { id: true, slug: true, name: true } } } },
} as const;

const createInput = z
  .object({
    name: z.string().min(1),
    scope: z.enum(["ALL", "SELECTED"]),
    templateIds: z.array(z.string().min(1)).default([]),
    expiresAt: z.coerce.date().optional(), // omit = permanent
  })
  .refine((v) => v.scope === "ALL" || v.templateIds.length > 0, {
    message: "SELECTED scope requires at least one templateId",
    path: ["templateIds"],
  });

// POST /api/api-keys — create a key. Returns the raw key exactly once.
apiKeys.post(
  "/",
  h(async (req, res) => {
    const input = createInput.parse(req.body);
    const templateIds = input.scope === "ALL" ? [] : input.templateIds;

    if (templateIds.length) {
      const found = await prisma.template.count({ where: { id: { in: templateIds } } });
      if (found !== new Set(templateIds).size) throw new HttpError(422, "unknown_template_id");
    }

    const gen = generateApiKey();
    const createdBy = (req as typeof req & { user?: { username: string } }).user?.username ?? null;

    const key = await prisma.apiKey.create({
      data: {
        name: input.name,
        prefix: gen.prefix,
        hashedKey: gen.hashedKey,
        hint: gen.hint,
        scope: input.scope,
        expiresAt: input.expiresAt ?? null,
        createdBy,
        templates: { create: templateIds.map((templateId) => ({ templateId })) },
      },
      select: PUBLIC_SELECT,
    });

    // `key` is the only time the raw secret is ever available.
    res.status(201).json({ ...key, key: gen.raw });
  })
);

// GET /api/api-keys — list keys (newest first), never the secret.
apiKeys.get(
  "/",
  h(async (_req, res) => {
    res.json(await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" }, select: PUBLIC_SELECT }));
  })
);

// POST /api/api-keys/:id/revoke — soft revoke (idempotent).
apiKeys.post(
  "/:id/revoke",
  h(async (req, res) => {
    const existing = await prisma.apiKey.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "api_key_not_found");
    res.json(
      await prisma.apiKey.update({
        where: { id: req.params.id },
        data: { revokedAt: existing.revokedAt ?? new Date() },
        select: PUBLIC_SELECT,
      })
    );
  })
);

// DELETE /api/api-keys/:id — hard delete (cleanup). Cascades grants.
apiKeys.delete(
  "/:id",
  h(async (req, res) => {
    await prisma.apiKey.delete({ where: { id: req.params.id } }).catch(() => {
      throw new HttpError(404, "api_key_not_found");
    });
    res.status(204).end();
  })
);
