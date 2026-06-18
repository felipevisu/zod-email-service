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

vi.mock("../../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { createApp } = await import("../../src/app.js");
const app = createApp();

let agent: Awaited<ReturnType<typeof authedAgent>>;
beforeAll(async () => {
  agent = await authedAgent(app);
});
beforeEach(() => vi.clearAllMocks());

describe("auth", () => {
  it("requires a session (401 without login)", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/api-keys");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/api-keys", () => {
  it("creates an ALL-scope key and returns the raw key exactly once", async () => {
    prismaMock.apiKey.create.mockResolvedValue({ id: "k1", name: "svc", scope: "ALL", prefix: "abcd", hint: "es_abcd…1234" });
    const res = await agent.post("/api/api-keys").send({ name: "svc", scope: "ALL" });
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^es_[0-9a-f]+_[0-9a-f]+$/); // raw key present
    expect(res.body).not.toHaveProperty("hashedKey"); // never the hash
    const data = prismaMock.apiKey.create.mock.calls[0][0].data;
    expect(data.scope).toBe("ALL");
    expect(data.createdBy).toBe("admin");
    expect(data.templates.create).toEqual([]); // ALL stores no grants
    expect(data.hashedKey).toBeTruthy();
  });

  it("creates a SELECTED key with template grants after validating the ids", async () => {
    prismaMock.template.count.mockResolvedValue(2);
    prismaMock.apiKey.create.mockResolvedValue({ id: "k2", scope: "SELECTED" });
    const res = await agent
      .post("/api/api-keys")
      .send({ name: "billing", scope: "SELECTED", templateIds: ["t1", "t2"] });
    expect(res.status).toBe(201);
    expect(prismaMock.template.count).toHaveBeenCalledWith({ where: { id: { in: ["t1", "t2"] } } });
    const data = prismaMock.apiKey.create.mock.calls[0][0].data;
    expect(data.templates.create).toEqual([{ templateId: "t1" }, { templateId: "t2" }]);
  });

  it("422s when SELECTED has no templateIds", async () => {
    const res = await agent.post("/api/api-keys").send({ name: "x", scope: "SELECTED", templateIds: [] });
    expect(res.status).toBe(422);
    expect(prismaMock.apiKey.create).not.toHaveBeenCalled();
  });

  it("422s when a templateId does not exist", async () => {
    prismaMock.template.count.mockResolvedValue(1); // only 1 of 2 found
    const res = await agent
      .post("/api/api-keys")
      .send({ name: "x", scope: "SELECTED", templateIds: ["t1", "ghost"] });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("unknown_template_id");
  });

  it("stores expiresAt when provided", async () => {
    prismaMock.apiKey.create.mockResolvedValue({ id: "k3" });
    await agent.post("/api/api-keys").send({ name: "temp", scope: "ALL", expiresAt: "2026-12-31T00:00:00Z" });
    const data = prismaMock.apiKey.create.mock.calls[0][0].data;
    expect(data.expiresAt).toBeInstanceOf(Date);
  });

  it("defaults expiresAt to null (permanent) when omitted", async () => {
    prismaMock.apiKey.create.mockResolvedValue({ id: "k4" });
    await agent.post("/api/api-keys").send({ name: "perma", scope: "ALL" });
    expect(prismaMock.apiKey.create.mock.calls[0][0].data.expiresAt).toBeNull();
  });
});

describe("GET /api/api-keys", () => {
  it("lists keys without secrets", async () => {
    prismaMock.apiKey.findMany.mockResolvedValue([{ id: "k1", prefix: "abcd", hint: "es_abcd…1" }]);
    const res = await agent.get("/api/api-keys");
    expect(res.status).toBe(200);
    expect(prismaMock.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    );
    // the select used must not include hashedKey
    const select = prismaMock.apiKey.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("hashedKey");
  });
});

describe("POST /api/api-keys/:id/revoke", () => {
  it("soft-revokes a key", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({ id: "k1", revokedAt: null });
    prismaMock.apiKey.update.mockResolvedValue({ id: "k1", revokedAt: new Date() });
    const res = await agent.post("/api/api-keys/k1/revoke");
    expect(res.status).toBe(200);
    expect(prismaMock.apiKey.update.mock.calls[0][0].data.revokedAt).toBeInstanceOf(Date);
  });

  it("404s on an unknown key", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(null);
    const res = await agent.post("/api/api-keys/nope/revoke");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("api_key_not_found");
  });

  it("keeps the original revokedAt when already revoked (idempotent)", async () => {
    const when = new Date("2026-01-01");
    prismaMock.apiKey.findUnique.mockResolvedValue({ id: "k1", revokedAt: when });
    prismaMock.apiKey.update.mockResolvedValue({ id: "k1", revokedAt: when });
    await agent.post("/api/api-keys/k1/revoke");
    expect(prismaMock.apiKey.update.mock.calls[0][0].data.revokedAt).toEqual(when);
  });
});

describe("DELETE /api/api-keys/:id", () => {
  it("deletes and returns 204", async () => {
    prismaMock.apiKey.delete.mockResolvedValue({});
    const res = await agent.delete("/api/api-keys/k1");
    expect(res.status).toBe(204);
  });

  it("404s when the key is missing", async () => {
    prismaMock.apiKey.delete.mockRejectedValue(new Error("not found"));
    const res = await agent.delete("/api/api-keys/nope");
    expect(res.status).toBe(404);
  });
});
