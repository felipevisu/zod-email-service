import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { authedAgent } from "../helpers.js";

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

vi.mock("../../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { createApp } = await import("../../src/app.js");
const app = createApp();

let agent: Awaited<ReturnType<typeof authedAgent>>;
beforeAll(async () => {
  agent = await authedAgent(app);
});
beforeEach(() => vi.clearAllMocks());

describe("POST /api/templates/:templateId/versions", () => {
  it("404s when the template does not exist", async () => {
    prismaMock.template.findUnique.mockResolvedValue(null);
    const res = await agent.post("/api/templates/nope/versions").send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("template_not_found");
  });

  it("creates version 1 for a template with no versions", async () => {
    prismaMock.template.findUnique.mockResolvedValue({ id: "t1" });
    prismaMock.version.findFirst.mockResolvedValue(null);
    prismaMock.version.create.mockResolvedValue({ id: "v1", version: 1 });
    const res = await agent.post("/api/templates/t1/versions").send({ subject: "Hi" });
    expect(res.status).toBe(201);
    expect(prismaMock.version.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 1, subject: "Hi" }) })
    );
  });

  it("auto-increments the version number", async () => {
    prismaMock.template.findUnique.mockResolvedValue({ id: "t1" });
    prismaMock.version.findFirst.mockResolvedValue({ version: 4 });
    prismaMock.version.create.mockResolvedValue({ id: "v5", version: 5 });
    await agent.post("/api/templates/t1/versions").send({});
    expect(prismaMock.version.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 5 }) })
    );
  });

  it("clones content from ?from when provided, body overrides clone", async () => {
    prismaMock.template.findUnique.mockResolvedValue({ id: "t1" });
    prismaMock.version.findUnique.mockResolvedValue({
      subject: "Old subject",
      mjml: "<mjml>old</mjml>",
      jsonSchema: { type: "object" },
      senderId: "s1",
    });
    prismaMock.version.findFirst.mockResolvedValue({ version: 1 });
    prismaMock.version.create.mockResolvedValue({ id: "v2" });
    await agent
      .post("/api/templates/t1/versions")
      .query({ from: "vSrc" })
      .send({ subject: "New subject" }); // overrides cloned subject, keeps cloned mjml/sender
    expect(prismaMock.version.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subject: "New subject",
          mjml: "<mjml>old</mjml>",
          senderId: "s1",
          version: 2,
        }),
      })
    );
  });

  it("ignores ?from when the source version is missing (starts blank)", async () => {
    prismaMock.template.findUnique.mockResolvedValue({ id: "t1" });
    prismaMock.version.findUnique.mockResolvedValue(null); // source not found
    prismaMock.version.findFirst.mockResolvedValue(null);
    prismaMock.version.create.mockResolvedValue({ id: "v1" });
    await agent.post("/api/templates/t1/versions").query({ from: "missing" }).send({});
    expect(prismaMock.version.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 1, subject: "", mjml: "", senderId: null }),
      })
    );
  });
});

describe("GET /api/versions/:id", () => {
  it("returns the version", async () => {
    prismaMock.version.findUnique.mockResolvedValue({ id: "v1" });
    const res = await agent.get("/api/versions/v1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("v1");
  });

  it("404s when missing", async () => {
    prismaMock.version.findUnique.mockResolvedValue(null);
    const res = await agent.get("/api/versions/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("version_not_found");
  });
});

describe("PUT /api/versions/:id", () => {
  it("updates subject/mjml/sender on a draft", async () => {
    prismaMock.version.findUnique.mockResolvedValue({
      id: "v1",
      status: "DRAFT",
      jsonSchema: {},
    });
    prismaMock.version.update.mockResolvedValue({ id: "v1", subject: "X" });
    const res = await agent.put("/api/versions/v1").send({ subject: "X", senderId: "s1" });
    expect(res.status).toBe(200);
    expect(prismaMock.version.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "v1" },
        data: { subject: "X", senderId: "s1" },
      })
    );
  });

  it("allows a schema change while DRAFT", async () => {
    prismaMock.version.findUnique.mockResolvedValue({
      id: "v1",
      status: "DRAFT",
      jsonSchema: { type: "object" },
    });
    prismaMock.version.update.mockResolvedValue({ id: "v1" });
    const res = await agent
      .put("/api/versions/v1")
      .send({ jsonSchema: { type: "object", properties: { a: { type: "string" } } } });
    expect(res.status).toBe(200);
  });

  it("rejects a schema change once PUBLISHED with 409", async () => {
    prismaMock.version.findUnique.mockResolvedValue({
      id: "v1",
      status: "PUBLISHED",
      jsonSchema: { type: "object", properties: { a: { type: "string" } } },
    });
    const res = await agent
      .put("/api/versions/v1")
      .send({ jsonSchema: { type: "object", properties: { b: { type: "number" } } } });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("schema_change_requires_new_version");
    expect(prismaMock.version.update).not.toHaveBeenCalled();
  });

  it("allows a no-op schema (key reorder) on a PUBLISHED version", async () => {
    prismaMock.version.findUnique.mockResolvedValue({
      id: "v1",
      status: "PUBLISHED",
      jsonSchema: { type: "object", required: ["a", "b"] },
    });
    prismaMock.version.update.mockResolvedValue({ id: "v1" });
    // same content, different key order — canonicalization treats it as equal
    const res = await agent
      .put("/api/versions/v1")
      .send({ jsonSchema: { required: ["a", "b"], type: "object" }, subject: "New" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/versions/:id/publish", () => {
  it("400s when no sender is assigned", async () => {
    prismaMock.version.findUnique.mockResolvedValue({ id: "v1", senderId: null });
    const res = await agent.post("/api/versions/v1/publish");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("sender_required_to_publish");
  });

  it("publishes when a sender is set", async () => {
    prismaMock.version.findUnique.mockResolvedValue({ id: "v1", senderId: "s1" });
    prismaMock.version.update.mockResolvedValue({ id: "v1", status: "PUBLISHED" });
    const res = await agent.post("/api/versions/v1/publish");
    expect(res.status).toBe(200);
    expect(prismaMock.version.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PUBLISHED" } })
    );
  });
});

describe("POST /api/versions/:id/preview", () => {
  it("renders the version with caller-supplied data", async () => {
    prismaMock.version.findUnique.mockResolvedValue({
      id: "v1",
      subject: "Hi {{name}}",
      mjml: "<mjml><mj-body><mj-section><mj-column><mj-text>{{name}}</mj-text></mj-column></mj-section></mj-body></mjml>",
    });
    const res = await agent.post("/api/versions/v1/preview").send({ data: { name: "Ann" } });
    expect(res.status).toBe(200);
    expect(res.body.subject).toBe("Hi Ann");
    expect(res.body.html).toContain("Ann");
  });
});

describe("DELETE /api/versions/:id", () => {
  it("deletes and returns 204", async () => {
    prismaMock.version.delete.mockResolvedValue({});
    const res = await agent.delete("/api/versions/v1");
    expect(res.status).toBe(204);
  });
});
