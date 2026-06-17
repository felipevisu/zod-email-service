import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { h, HttpError } from "../lib/http.js";
import { render } from "../services/render.js";

export const versions = Router();

const versionBody = z.object({
  subject: z.string().default(""),
  mjml: z.string().default(""),
  jsonSchema: z.record(z.any()).default({}),
  senderId: z.string().nullable().optional(),
});

// Canonical JSON (sorted keys) so key order doesn't read as a schema change.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical((value as any)[k])).join(",") + "}";
  }
  return JSON.stringify(value ?? null);
}

function schemaEqual(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

async function loadVersion(id: string) {
  const v = await prisma.version.findUnique({
    where: { id },
    include: { sender: true, template: { include: { category: true } } },
  });
  if (!v) throw new HttpError(404, "version_not_found");
  return v;
}

// Create a new version for a template. Number auto-increments per template.
// Pass ?from=<versionId> to clone an existing version as the starting point.
versions.post(
  "/templates/:templateId/versions",
  h(async (req, res) => {
    const { templateId } = req.params;
    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template) throw new HttpError(404, "template_not_found");

    const fromId = req.query.from as string | undefined;
    let base = { subject: "", mjml: "", jsonSchema: {} as unknown, senderId: null as string | null };
    if (fromId) {
      const src = await prisma.version.findUnique({ where: { id: fromId } });
      if (src) base = { subject: src.subject, mjml: src.mjml, jsonSchema: src.jsonSchema as unknown, senderId: src.senderId };
    }
    const body = versionBody.partial().parse(req.body);

    const last = await prisma.version.findFirst({
      where: { templateId },
      orderBy: { version: "desc" },
    });
    const nextNumber = (last?.version ?? 0) + 1;

    const created = await prisma.version.create({
      data: {
        templateId,
        version: nextNumber,
        subject: body.subject ?? base.subject,
        mjml: body.mjml ?? base.mjml,
        jsonSchema: (body.jsonSchema ?? base.jsonSchema) as object,
        senderId: body.senderId !== undefined ? body.senderId : base.senderId,
      },
      include: { sender: true },
    });
    res.status(201).json(created);
  })
);

versions.get("/versions/:id", h(async (req, res) => res.json(await loadVersion(req.params.id))));

// Edit a version. Subject, MJML and sender are always editable. The schema is
// frozen once published — changing it requires a new version, since other
// services validate their payloads against it.
versions.put(
  "/versions/:id",
  h(async (req, res) => {
    const existing = await loadVersion(req.params.id);
    const body = versionBody.partial().parse(req.body);

    if (
      existing.status === "PUBLISHED" &&
      body.jsonSchema !== undefined &&
      !schemaEqual(existing.jsonSchema, body.jsonSchema)
    ) {
      throw new HttpError(409, "schema_change_requires_new_version", {
        hint: "Create a new version (POST /templates/:templateId/versions?from=" + existing.id + ").",
      });
    }
    const updated = await prisma.version.update({
      where: { id: req.params.id },
      data: {
        ...(body.subject !== undefined && { subject: body.subject }),
        ...(body.mjml !== undefined && { mjml: body.mjml }),
        ...(body.jsonSchema !== undefined && { jsonSchema: body.jsonSchema as object }),
        ...(body.senderId !== undefined && { senderId: body.senderId }),
      },
      include: { sender: true },
    });
    res.json(updated);
  })
);

versions.post(
  "/versions/:id/publish",
  h(async (req, res) => {
    const v = await loadVersion(req.params.id);
    if (!v.senderId) throw new HttpError(400, "sender_required_to_publish");
    res.json(
      await prisma.version.update({
        where: { id: v.id },
        data: { status: "PUBLISHED" },
        include: { sender: true },
      })
    );
  })
);

// Render preview with caller-supplied sample data. Does not send.
versions.post(
  "/versions/:id/preview",
  h(async (req, res) => {
    const v = await loadVersion(req.params.id);
    const data = z.record(z.any()).default({}).parse(req.body?.data ?? {});
    res.json(render(v.mjml, v.subject, data));
  })
);

versions.delete(
  "/versions/:id",
  h(async (req, res) => {
    await prisma.version.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
