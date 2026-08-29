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

describe("GET /api/senders", () => {
  it("lists senders, newest first, masking credentials", async () => {
    prismaMock.sender.findMany.mockResolvedValue([
      { id: "s1", email: "a@b.com", credentials: "sealed-blob" },
      { id: "s2", email: "c@d.com", credentials: null },
    ]);
    const res = await agent.get("/api/senders");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: "s1", email: "a@b.com", hasCredentials: true },
      { id: "s2", email: "c@d.com", hasCredentials: false },
    ]);
    expect(prismaMock.sender.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" } });
  });
});

describe("POST /api/senders", () => {
  it("creates a sender with defaulted provider and region", async () => {
    prismaMock.sender.create.mockResolvedValue({ id: "s1" });
    const res = await agent.post("/api/senders").send({ name: "Acme", email: "a@b.com" });
    expect(res.status).toBe(201);
    expect(prismaMock.sender.create).toHaveBeenCalledWith({
      data: { name: "Acme", email: "a@b.com", provider: "SES", region: "us-east-1", credentials: null },
    });
  });

  it("encrypts credentials at rest and never echoes them", async () => {
    prismaMock.sender.create.mockImplementation(async ({ data }: any) => ({ id: "s1", ...data }));
    const res = await agent.post("/api/senders").send({
      name: "Acme",
      email: "a@b.com",
      provider: "RESEND",
      credentials: { apiKey: "re_secret" },
    });
    expect(res.status).toBe(201);
    const stored = prismaMock.sender.create.mock.calls[0][0].data.credentials;
    expect(stored).not.toContain("re_secret"); // encrypted, not plaintext
    expect(res.body.credentials).toBeUndefined();
    expect(res.body.hasCredentials).toBe(true);
  });

  it("rejects RESEND credentials missing apiKey with 422", async () => {
    const res = await agent.post("/api/senders").send({
      name: "Acme",
      email: "a@b.com",
      provider: "RESEND",
      credentials: { accessKeyId: "AKIA", secretAccessKey: "s" },
    });
    expect(res.status).toBe(422);
    expect(prismaMock.sender.create).not.toHaveBeenCalled();
  });

  it("rejects SES credentials missing secretAccessKey with 422", async () => {
    const res = await agent.post("/api/senders").send({
      name: "Acme",
      email: "a@b.com",
      credentials: { accessKeyId: "AKIA" },
    });
    expect(res.status).toBe(422);
    expect(prismaMock.sender.create).not.toHaveBeenCalled();
  });

  it("rejects invalid email with 422", async () => {
    const res = await agent.post("/api/senders").send({ name: "Acme", email: "nope" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation_error");
    expect(prismaMock.sender.create).not.toHaveBeenCalled();
  });

  it("rejects missing name with 422", async () => {
    const res = await agent.post("/api/senders").send({ email: "a@b.com" });
    expect(res.status).toBe(422);
  });
});

describe("PUT /api/senders/:id", () => {
  it("updates with a partial body, leaving credentials untouched", async () => {
    prismaMock.sender.update.mockResolvedValue({ id: "s1", name: "New" });
    const res = await agent.put("/api/senders/s1").send({ name: "New" });
    expect(res.status).toBe(200);
    expect(prismaMock.sender.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { name: "New" },
    });
  });

  it("validates credentials against the stored provider when none is sent", async () => {
    prismaMock.sender.findUnique.mockResolvedValue({ id: "s1", provider: "RESEND" });
    const res = await agent.put("/api/senders/s1").send({ credentials: { accessKeyId: "x", secretAccessKey: "y" } });
    expect(res.status).toBe(422);
    expect(prismaMock.sender.update).not.toHaveBeenCalled();
  });

  it("clears credentials with an explicit null", async () => {
    prismaMock.sender.update.mockResolvedValue({ id: "s1" });
    const res = await agent.put("/api/senders/s1").send({ credentials: null });
    expect(res.status).toBe(200);
    expect(prismaMock.sender.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { credentials: null },
    });
  });
});

describe("DELETE /api/senders/:id", () => {
  it("deletes and returns 204", async () => {
    prismaMock.sender.delete.mockResolvedValue({});
    const res = await agent.delete("/api/senders/s1");
    expect(res.status).toBe(204);
  });

  it("returns 404 when the sender is missing", async () => {
    prismaMock.sender.delete.mockRejectedValue(new Error("not found"));
    const res = await agent.delete("/api/senders/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("sender_not_found");
  });
});
