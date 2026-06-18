import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { h, HttpError } from "../lib/http.js";
import { requireApiKey } from "../lib/apiKey.js";
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

// Best-effort audit log; never let logging failures break the send response.
async function logFailure(args: {
  category: string;
  template: string;
  version: number;
  to: string[];
  subject?: string;
  senderEmail?: string | null;
  versionId?: string | null;
  apiKeyId?: string | null;
  apiKeyName?: string | null;
  errorCode: string;
  errorDetail?: unknown;
}) {
  try {
    await prisma.emailLog.create({
      data: {
        status: "FAILED",
        to: args.to,
        subject: args.subject ?? "",
        category: args.category,
        template: args.template,
        version: args.version,
        senderEmail: args.senderEmail ?? null,
        versionId: args.versionId ?? null,
        apiKeyId: args.apiKeyId ?? null,
        apiKeyName: args.apiKeyName ?? null,
        errorCode: args.errorCode,
        errorDetail:
          args.errorDetail == null
            ? null
            : typeof args.errorDetail === "string"
              ? args.errorDetail
              : JSON.stringify(args.errorDetail),
      },
    });
  } catch (e) {
    console.error("failed to write email log", e);
  }
}

/**
 * Public send endpoint, e.g. POST /accounts/password-recovery/v1
 *   body: { "to": "user@x.com", "data": { ...template params } }
 * The data is validated against the version's JSON Schema (via Zod) before render.
 *
 * Every attempt is recorded in EmailLog (success or failure) so usage is
 * visible in the UI.
 */
send.post(
  "/:category/:template/:version",
  requireApiKey,
  h(async (req, res) => {
    const { category, template } = req.params;
    const versionNumber = parseVersionParam(req.params.version);
    const apiKey = (req as typeof req & { apiKey?: { id: string; name: string; scope: string } }).apiKey!;

    // Resolve recipients early so failures can still be logged with a target.
    const toList = (() => {
      const raw = req.body?.to;
      if (typeof raw === "string") return [raw];
      if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
      return [];
    })();

    const version = await prisma.version.findFirst({
      where: {
        version: versionNumber,
        template: { slug: template, category: { slug: category } },
      },
      include: { sender: true },
    });

    const keyAudit = { apiKeyId: apiKey.id, apiKeyName: apiKey.name };

    if (!version) {
      await logFailure({ category, template, version: versionNumber, to: toList, ...keyAudit, errorCode: "email_version_not_found" });
      throw new HttpError(404, "email_version_not_found");
    }

    const base = {
      category,
      template,
      version: versionNumber,
      to: toList,
      senderEmail: version.sender?.email ?? null,
      versionId: version.id,
      ...keyAudit,
    };

    // Per-template scope: SELECTED keys may only send their granted templates.
    if (apiKey.scope === "SELECTED") {
      const grant = await prisma.apiKeyTemplate.findUnique({
        where: { apiKeyId_templateId: { apiKeyId: apiKey.id, templateId: version.templateId } },
      });
      if (!grant) {
        await logFailure({ ...base, subject: version.subject, errorCode: "template_not_authorized" });
        throw new HttpError(403, "template_not_authorized", {
          hint: "This API key is not scoped to send this template.",
        });
      }
    }

    if (version.status !== "PUBLISHED") {
      await logFailure({ ...base, subject: version.subject, errorCode: "version_not_published" });
      throw new HttpError(409, "version_not_published", { hint: "Publish this version before sending." });
    }
    if (!version.sender) {
      await logFailure({ ...base, subject: version.subject, errorCode: "no_sender_assigned" });
      throw new HttpError(409, "no_sender_assigned");
    }

    let to: string | string[];
    let data: Record<string, unknown>;
    try {
      const parsed = envelope.parse(req.body);
      to = parsed.to;
      data = parsed.data;
    } catch (e) {
      const detail = e instanceof z.ZodError ? e.issues : e;
      await logFailure({ ...base, subject: version.subject, errorCode: "validation_error", errorDetail: detail });
      throw e;
    }
    const recipients = Array.isArray(to) ? to : [to];

    // Validate the payload params against the version's registered schema.
    let params: unknown;
    try {
      params = jsonSchemaToZod(version.jsonSchema as object).parse(data);
    } catch (e) {
      const detail = e instanceof z.ZodError ? e.issues : e;
      await logFailure({ ...base, to: recipients, subject: version.subject, errorCode: "validation_error", errorDetail: detail });
      throw e;
    }

    const rendered = render(version.mjml, version.subject, params as Record<string, unknown>);
    if (rendered.errors.length) {
      await logFailure({ ...base, to: recipients, subject: version.subject, errorCode: "render_error", errorDetail: rendered.errors });
      throw new HttpError(500, "render_error", { errors: rendered.errors });
    }

    let result: { messageId: string; dryRun: boolean };
    try {
      result = await sendEmail({
        from: `${version.sender.name} <${version.sender.email}>`,
        to: recipients,
        subject: rendered.subject,
        html: rendered.html,
        region: version.sender.region,
      });
    } catch (e) {
      await logFailure({
        ...base,
        to: recipients,
        subject: rendered.subject,
        errorCode: "ses_send_failed",
        errorDetail: e instanceof Error ? e.message : String(e),
      });
      throw new HttpError(502, "ses_send_failed", {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    await prisma.emailLog.create({
      data: {
        status: "SENT",
        to: recipients,
        subject: rendered.subject,
        category,
        template,
        version: versionNumber,
        senderEmail: version.sender.email,
        versionId: version.id,
        apiKeyId: apiKey.id,
        apiKeyName: apiKey.name,
        messageId: result.messageId,
        dryRun: result.dryRun,
      },
    }).catch((e) => console.error("failed to write email log", e));

    res.json({
      ok: true,
      messageId: result.messageId,
      dryRun: result.dryRun,
      to,
      subject: rendered.subject,
    });
  })
);
