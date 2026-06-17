import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { h, HttpError } from "../lib/http.js";
import { jsonSchemaToZod } from "../lib/jsonSchemaToZod.js";
import { render } from "../services/render.js";
import { sendEmail } from "../services/ses.js";

export const send = Router();

const envelope = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  data: z.record(z.any()).default({}),
});

// Parse "v1" / "v12" -> 1 / 12.
function parseVersionParam(raw: string): number {
  const m = /^v(\d+)$/i.exec(raw);
  if (!m) throw new HttpError(400, "bad_version_param", { expected: "v<number>, e.g. v1" });
  return Number(m[1]);
}

/**
 * Public send endpoint, e.g. POST /accounts/password-recovery/v1
 *   body: { "to": "user@x.com", "data": { ...template params } }
 * The data is validated against the version's JSON Schema (via Zod) before render.
 */
send.post(
  "/:category/:template/:version",
  h(async (req, res) => {
    const versionNumber = parseVersionParam(req.params.version);

    const version = await prisma.version.findFirst({
      where: {
        version: versionNumber,
        template: {
          slug: req.params.template,
          category: { slug: req.params.category },
        },
      },
      include: { sender: true },
    });

    if (!version) throw new HttpError(404, "email_version_not_found");
    if (version.status !== "PUBLISHED")
      throw new HttpError(409, "version_not_published", {
        hint: "Publish this version before sending.",
      });
    if (!version.sender) throw new HttpError(409, "no_sender_assigned");

    const { to, data } = envelope.parse(req.body);

    // Validate the payload params against the version's registered schema.
    const paramsSchema = jsonSchemaToZod(version.jsonSchema as object);
    const params = paramsSchema.parse(data);

    const rendered = render(version.mjml, version.subject, params as Record<string, unknown>);
    if (rendered.errors.length)
      throw new HttpError(500, "render_error", { errors: rendered.errors });

    const result = await sendEmail({
      from: `${version.sender.name} <${version.sender.email}>`,
      to: Array.isArray(to) ? to : [to],
      subject: rendered.subject,
      html: rendered.html,
      region: version.sender.region,
    });

    res.json({
      ok: true,
      messageId: result.messageId,
      dryRun: result.dryRun,
      to,
      subject: rendered.subject,
    });
  })
);
