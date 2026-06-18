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

vi.mock("../../src/lib/prisma.js", () => ({ prisma: prismaMock }));

const { createApp } = await import("../../src/app.js");
const app = createApp();

beforeEach(() => vi.clearAllMocks());

describe("GET /api/senders", () => {
  it("lists senders, newest first", async () => {
    prismaMock.sender.findMany.mockResolvedValue([{ id: "s1", email: "a@b.com" }]);
    const res = await request(app).get("/api/senders");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "s1", email: "a@b.com" }]);
    expect(prismaMock.sender.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" } });
  });
});

describe("POST /api/senders", () => {
  it("creates a sender with defaulted region", async () => {
    prismaMock.sender.create.mockResolvedValue({ id: "s1" });
    const res = await request(app).post("/api/senders").send({ name: "Acme", email: "a@b.com" });
    expect(res.status).toBe(201);
    expect(prismaMock.sender.create).toHaveBeenCalledWith({
      data: { name: "Acme", email: "a@b.com", region: "us-east-1" },
    });
  });

  it("rejects invalid email with 422", async () => {
    const res = await request(app).post("/api/senders").send({ name: "Acme", email: "nope" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation_error");
    expect(prismaMock.sender.create).not.toHaveBeenCalled();
  });

  it("rejects missing name with 422", async () => {
    const res = await request(app).post("/api/senders").send({ email: "a@b.com" });
    expect(res.status).toBe(422);
  });
});

describe("PUT /api/senders/:id", () => {
  it("updates with a partial body", async () => {
    prismaMock.sender.update.mockResolvedValue({ id: "s1", name: "New" });
    const res = await request(app).put("/api/senders/s1").send({ name: "New" });
    expect(res.status).toBe(200);
    expect(prismaMock.sender.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { name: "New" },
    });
  });
});

describe("DELETE /api/senders/:id", () => {
  it("deletes and returns 204", async () => {
    prismaMock.sender.delete.mockResolvedValue({});
    const res = await request(app).delete("/api/senders/s1");
    expect(res.status).toBe(204);
  });

  it("returns 404 when the sender is missing", async () => {
    prismaMock.sender.delete.mockRejectedValue(new Error("not found"));
    const res = await request(app).delete("/api/senders/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("sender_not_found");
  });
});
