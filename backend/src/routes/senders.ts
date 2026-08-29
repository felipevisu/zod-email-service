import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { h, HttpError } from "../lib/http.js";
import { seal } from "../lib/crypto.js";

export const senders = Router();

const sesCredentials = z.object({
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
});
const resendCredentials = z.object({
  apiKey: z.string().min(1),
});

const senderInput = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    provider: z.enum(["SES", "RESEND"]).default("SES"),
    region: z.string().min(1).default("us-east-1"),
    credentials: z.record(z.string()).nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.credentials == null) return;
    const schema = v.provider === "RESEND" ? resendCredentials : sesCredentials;
    const res = schema.safeParse(v.credentials);
    if (!res.success) for (const issue of res.error.issues) ctx.addIssue({ ...issue, path: ["credentials", ...issue.path] });
  });

// Credentials never leave the server; the UI only needs to know they exist.
function mask<T extends { credentials?: string | null }>(s: T) {
  const { credentials, ...rest } = s;
  return { ...rest, hasCredentials: credentials != null };
}

function encrypt(credentials: Record<string, string> | null | undefined) {
  return credentials == null ? null : seal(JSON.stringify(credentials));
}

senders.get(
  "/",
  h(async (_req, res) => {
    const all = await prisma.sender.findMany({ orderBy: { createdAt: "desc" } });
    res.json(all.map(mask));
  })
);

senders.post(
  "/",
  h(async (req, res) => {
    const { credentials, ...data } = senderInput.parse(req.body);
    res.status(201).json(
      mask(await prisma.sender.create({ data: { ...data, credentials: encrypt(credentials) } }))
    );
  })
);

senders.put(
  "/:id",
  h(async (req, res) => {
    const { credentials, ...data } = senderInput.innerType().partial().parse(req.body);
    if (credentials != null) {
      // Validate against the provider being set, or the stored one.
      let provider = data.provider;
      if (!provider) {
        const existing = await prisma.sender.findUnique({ where: { id: req.params.id } });
        if (!existing) throw new HttpError(404, "sender_not_found");
        provider = existing.provider;
      }
      const schema = provider === "RESEND" ? resendCredentials : sesCredentials;
      const parsed = schema.safeParse(credentials);
      if (!parsed.success) throw new HttpError(422, "validation_error", { issues: parsed.error.issues });
    }
    res.json(
      mask(
        await prisma.sender.update({
          where: { id: req.params.id },
          // undefined = leave as-is; null = clear; object = replace.
          data: { ...data, ...(credentials !== undefined ? { credentials: encrypt(credentials) } : {}) },
        })
      )
    );
  })
);

senders.delete(
  "/:id",
  h(async (req, res) => {
    await prisma.sender.delete({ where: { id: req.params.id } }).catch(() => {
      throw new HttpError(404, "sender_not_found");
    });
    res.status(204).end();
  })
);
