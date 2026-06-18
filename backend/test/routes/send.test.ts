import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { generateApiKey } from "../../src/lib/apiKeys.js";

const { prismaMock } = vi.hoisted(() => {
  const m = () => ({
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  });
  return {
    prismaMock: {
      sender: m(),
      category: m(),
      template: m(),
      version: m(),
      emailLog: m(),
      apiKey: m(),
      apiKeyTemplate: m(),
    },
  };
});
const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));

vi.mock("../../src/lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../../src/services/ses.js", () => ({ sendEmail: sendEmailMock }));

const { createApp } = await import("../../src/app.js");
const app = createApp();

// A valid key whose hash the mocked DB row will match.
const KEY = generateApiKey();
function keyRow(over: Record<string, unknown> = {}) {
  return {
    id: "k1",
    name: "test key",
    prefix: KEY.prefix,
    hashedKey: KEY.hashedKey,
    hint: KEY.hint,
    scope: "ALL",
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: new Date(), // recent -> throttle skips the update
    ...over,
  };
}

// Supertest request carrying the API key header.
const send = (path: string) => request(app).post(path).set("x-api-key", KEY.raw);

const GOOD_MJML =
  "<mjml><mj-body><mj-section><mj-column><mj-text>Hi {{name}}</mj-text></mj-column></mj-section></mj-body></mjml>";

function publishedVersion(over: Record<string, unknown> = {}) {
  return {
    id: "v1",
    templateId: "t1",
    status: "PUBLISHED",
    subject: "Hello {{name}}",
    mjml: GOOD_MJML,
    jsonSchema: {},
    sender: { name: "Acme", email: "no-reply@acme.com", region: "us-east-1" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.emailLog.create.mockResolvedValue({});
  prismaMock.apiKey.findUnique.mockResolvedValue(keyRow());
  prismaMock.apiKey.update.mockResolvedValue(keyRow());
  prismaMock.apiKeyTemplate.findUnique.mockResolvedValue({ apiKeyId: "k1", templateId: "t1" });
});

describe("send auth — API key", () => {
  it("401s when no key is presented", async () => {
    const res = await request(app).post("/accounts/welcome/v1").send({ to: "a@b.com" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_api_key");
    expect(prismaMock.version.findFirst).not.toHaveBeenCalled();
  });

  it("401s on a malformed key", async () => {
    const res = await request(app).post("/accounts/welcome/v1").set("x-api-key", "garbage").send({ to: "a@b.com" });
    expect(res.status).toBe(401);
  });

  it("401s when the key is unknown (no DB row)", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(null);
    const res = await send("/accounts/welcome/v1").send({ to: "a@b.com" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_api_key");
  });

  it("401s when the secret does not match the stored hash", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(keyRow({ hashedKey: "deadbeef" }));
    const res = await send("/accounts/welcome/v1").send({ to: "a@b.com" });
    expect(res.status).toBe(401);
  });

  it("401s when the key is revoked", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(keyRow({ revokedAt: new Date("2020-01-01") }));
    const res = await send("/accounts/welcome/v1").send({ to: "a@b.com" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("api_key_inactive");
  });

  it("401s when the key is expired", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(keyRow({ expiresAt: new Date("2020-01-01") }));
    const res = await send("/accounts/welcome/v1").send({ to: "a@b.com" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("api_key_inactive");
  });

  it("accepts the key via Authorization: Bearer", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion());
    sendEmailMock.mockResolvedValue({ messageId: "m", dryRun: false });
    const res = await request(app)
      .post("/accounts/welcome/v1")
      .set("authorization", `Bearer ${KEY.raw}`)
      .send({ to: "a@b.com", data: { name: "Ann" } });
    expect(res.status).toBe(200);
  });
});

describe("send scope — SELECTED keys", () => {
  it("403s when the key is not scoped to the template, and logs it", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(keyRow({ scope: "SELECTED" }));
    prismaMock.apiKeyTemplate.findUnique.mockResolvedValue(null); // no grant
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion());
    const res = await send("/accounts/welcome/v1").send({ to: "a@b.com", data: { name: "Z" } });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("template_not_authorized");
    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorCode: "template_not_authorized" }) })
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sends when the key is scoped to the template", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(keyRow({ scope: "SELECTED" }));
    prismaMock.apiKeyTemplate.findUnique.mockResolvedValue({ apiKeyId: "k1", templateId: "t1" });
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion());
    sendEmailMock.mockResolvedValue({ messageId: "m", dryRun: false });
    const res = await send("/accounts/welcome/v1").send({ to: "a@b.com", data: { name: "Z" } });
    expect(res.status).toBe(200);
    expect(prismaMock.apiKeyTemplate.findUnique).toHaveBeenCalledWith({
      where: { apiKeyId_templateId: { apiKeyId: "k1", templateId: "t1" } },
    });
  });

  it("ALL-scope keys skip the per-template check", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion());
    sendEmailMock.mockResolvedValue({ messageId: "m", dryRun: false });
    await send("/accounts/welcome/v1").send({ to: "a@b.com", data: { name: "Z" } });
    expect(prismaMock.apiKeyTemplate.findUnique).not.toHaveBeenCalled();
  });
});

describe("POST /:category/:template/:version — param parsing", () => {
  it("400s on a malformed version param", async () => {
    const res = await send("/accounts/welcome/foo").send({ to: "a@b.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bad_version_param");
    expect(prismaMock.version.findFirst).not.toHaveBeenCalled();
  });
});

describe("POST /:category/:template/:version — lookup failures", () => {
  it("404s and logs when the version does not exist", async () => {
    prismaMock.version.findFirst.mockResolvedValue(null);
    const res = await send("/accounts/welcome/v1").send({ to: "a@b.com" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("email_version_not_found");
    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", errorCode: "email_version_not_found" }),
      })
    );
  });

  it("logs a recipient array when the version is missing (filters non-strings)", async () => {
    prismaMock.version.findFirst.mockResolvedValue(null);
    const res = await send("/accounts/welcome/v1").send({ to: ["a@b.com", 123, "c@d.com"] });
    expect(res.status).toBe(404);
    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ to: ["a@b.com", "c@d.com"] }) })
    );
  });

  it("409s and logs when the version is not published", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion({ status: "DRAFT" }));
    const res = await send("/accounts/welcome/v1").send({ to: "a@b.com" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("version_not_published");
    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorCode: "version_not_published" }) })
    );
  });

  it("409s and logs when no sender is assigned", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion({ sender: null }));
    const res = await send("/accounts/welcome/v1").send({ to: "a@b.com" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("no_sender_assigned");
  });
});

describe("POST /:category/:template/:version — validation", () => {
  it("422s on a bad envelope (invalid recipient) and logs validation_error", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion());
    const res = await send("/accounts/welcome/v1").send({ to: "not-an-email" });
    expect(res.status).toBe(422);
    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorCode: "validation_error" }) })
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("422s when data fails the version's JSON Schema", async () => {
    prismaMock.version.findFirst.mockResolvedValue(
      publishedVersion({
        jsonSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      })
    );
    const res = await send("/accounts/welcome/v1").send({ to: "a@b.com", data: {} });
    expect(res.status).toBe(422);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("POST /:category/:template/:version — render + send", () => {
  it("500s and logs render_error on invalid MJML", async () => {
    prismaMock.version.findFirst.mockResolvedValue(
      publishedVersion({ mjml: "<mjml><mj-body><mj-text>oops</mj-text></mj-body></mjml>" })
    );
    const res = await send("/accounts/welcome/v1").send({ to: "a@b.com" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("render_error");
    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorCode: "render_error" }) })
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("502s and logs when SES fails", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion());
    sendEmailMock.mockRejectedValue(new Error("Throttling"));
    const res = await send("/accounts/welcome/v1").send({ to: "a@b.com", data: { name: "Ann" } });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("ses_send_failed");
    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorCode: "ses_send_failed", errorDetail: "Throttling" }),
      })
    );
  });

  it("sends successfully, logs SENT with the api key, returns messageId + subject", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion());
    sendEmailMock.mockResolvedValue({ messageId: "msg-1", dryRun: false });
    const res = await send("/accounts/welcome/v1").send({ to: "a@b.com", data: { name: "Ann" } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, messageId: "msg-1", dryRun: false, subject: "Hello Ann" });
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Acme <no-reply@acme.com>",
        to: ["a@b.com"],
        subject: "Hello Ann",
        region: "us-east-1",
      })
    );
    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SENT",
          messageId: "msg-1",
          apiKeyId: "k1",
          apiKeyName: "test key",
        }),
      })
    );
  });

  it("accepts an array of recipients", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion());
    sendEmailMock.mockResolvedValue({ messageId: "msg-2", dryRun: true });
    const res = await send("/accounts/welcome/v1").send({ to: ["a@b.com", "c@d.com"], data: { name: "Z" } });
    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: ["a@b.com", "c@d.com"] }));
  });

  it("resolves the version by category + template slug + version number", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion());
    sendEmailMock.mockResolvedValue({ messageId: "m", dryRun: false });
    await send("/accounts/welcome/v3").send({ to: "a@b.com", data: { name: "Q" } });
    expect(prismaMock.version.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { version: 3, template: { slug: "welcome", category: { slug: "accounts" } } },
        include: { sender: true },
      })
    );
  });
});
