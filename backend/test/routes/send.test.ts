import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

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
  return { prismaMock: { sender: m(), category: m(), template: m(), version: m(), emailLog: m() } };
});
const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));

vi.mock("../../src/lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../../src/services/ses.js", () => ({ sendEmail: sendEmailMock }));

const { createApp } = await import("../../src/app.js");
const app = createApp();

const GOOD_MJML =
  "<mjml><mj-body><mj-section><mj-column><mj-text>Hi {{name}}</mj-text></mj-column></mj-section></mj-body></mjml>";

function publishedVersion(over: Record<string, unknown> = {}) {
  return {
    id: "v1",
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
});

describe("POST /:category/:template/:version — param parsing", () => {
  it("400s on a malformed version param", async () => {
    const res = await request(app).post("/accounts/welcome/foo").send({ to: "a@b.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bad_version_param");
    expect(prismaMock.version.findFirst).not.toHaveBeenCalled();
  });
});

describe("POST /:category/:template/:version — lookup failures", () => {
  it("404s and logs when the version does not exist", async () => {
    prismaMock.version.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/accounts/welcome/v1").send({ to: "a@b.com" });
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
    const res = await request(app)
      .post("/accounts/welcome/v1")
      .send({ to: ["a@b.com", 123, "c@d.com"] });
    expect(res.status).toBe(404);
    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ to: ["a@b.com", "c@d.com"] }) })
    );
  });

  it("409s and logs when the version is not published", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion({ status: "DRAFT" }));
    const res = await request(app).post("/accounts/welcome/v1").send({ to: "a@b.com" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("version_not_published");
    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorCode: "version_not_published" }) })
    );
  });

  it("409s and logs when no sender is assigned", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion({ sender: null }));
    const res = await request(app).post("/accounts/welcome/v1").send({ to: "a@b.com" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("no_sender_assigned");
  });
});

describe("POST /:category/:template/:version — validation", () => {
  it("422s on a bad envelope (invalid recipient) and logs validation_error", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion());
    const res = await request(app).post("/accounts/welcome/v1").send({ to: "not-an-email" });
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
    const res = await request(app).post("/accounts/welcome/v1").send({ to: "a@b.com", data: {} });
    expect(res.status).toBe(422);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("POST /:category/:template/:version — render + send", () => {
  it("500s and logs render_error on invalid MJML", async () => {
    prismaMock.version.findFirst.mockResolvedValue(
      publishedVersion({ mjml: "<mjml><mj-body><mj-text>oops</mj-text></mj-body></mjml>" })
    );
    const res = await request(app).post("/accounts/welcome/v1").send({ to: "a@b.com" });
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
    const res = await request(app).post("/accounts/welcome/v1").send({ to: "a@b.com", data: { name: "Ann" } });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("ses_send_failed");
    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorCode: "ses_send_failed", errorDetail: "Throttling" }),
      })
    );
  });

  it("sends successfully, logs SENT, returns messageId + rendered subject", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion());
    sendEmailMock.mockResolvedValue({ messageId: "msg-1", dryRun: false });
    const res = await request(app)
      .post("/accounts/welcome/v1")
      .send({ to: "a@b.com", data: { name: "Ann" } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      messageId: "msg-1",
      dryRun: false,
      subject: "Hello Ann",
    });
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
        data: expect.objectContaining({ status: "SENT", messageId: "msg-1" }),
      })
    );
  });

  it("accepts an array of recipients", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion());
    sendEmailMock.mockResolvedValue({ messageId: "msg-2", dryRun: true });
    const res = await request(app)
      .post("/accounts/welcome/v1")
      .send({ to: ["a@b.com", "c@d.com"], data: { name: "Z" } });
    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["a@b.com", "c@d.com"] })
    );
  });

  it("resolves the version by category + template slug + version number", async () => {
    prismaMock.version.findFirst.mockResolvedValue(publishedVersion());
    sendEmailMock.mockResolvedValue({ messageId: "m", dryRun: false });
    await request(app).post("/accounts/welcome/v3").send({ to: "a@b.com", data: { name: "Q" } });
    expect(prismaMock.version.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          version: 3,
          template: { slug: "welcome", category: { slug: "accounts" } },
        },
        include: { sender: true },
      })
    );
  });
});
