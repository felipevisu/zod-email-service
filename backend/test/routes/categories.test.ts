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

describe("GET /api/categories", () => {
  it("lists categories with template counts, slug-ordered", async () => {
    prismaMock.category.findMany.mockResolvedValue([{ id: "c1", slug: "accounts" }]);
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(prismaMock.category.findMany).toHaveBeenCalledWith({
      orderBy: { slug: "asc" },
      include: { _count: { select: { templates: true } } },
    });
  });
});

describe("POST /api/categories", () => {
  it("creates a category", async () => {
    prismaMock.category.create.mockResolvedValue({ id: "c1" });
    const res = await request(app).post("/api/categories").send({ slug: "accounts", name: "Accounts" });
    expect(res.status).toBe(201);
    expect(prismaMock.category.create).toHaveBeenCalledWith({
      data: { slug: "accounts", name: "Accounts" },
    });
  });

  it("rejects an invalid slug (uppercase / spaces) with 422", async () => {
    const res = await request(app).post("/api/categories").send({ slug: "Bad Slug", name: "x" });
    expect(res.status).toBe(422);
    expect(prismaMock.category.create).not.toHaveBeenCalled();
  });
});

describe("PUT /api/categories/:id", () => {
  it("updates partially", async () => {
    prismaMock.category.update.mockResolvedValue({ id: "c1" });
    const res = await request(app).put("/api/categories/c1").send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(prismaMock.category.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { name: "Renamed" },
    });
  });
});

describe("DELETE /api/categories/:id", () => {
  it("deletes and returns 204", async () => {
    prismaMock.category.delete.mockResolvedValue({});
    const res = await request(app).delete("/api/categories/c1");
    expect(res.status).toBe(204);
    expect(prismaMock.category.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});
