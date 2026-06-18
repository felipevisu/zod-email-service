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

describe("GET /api/templates", () => {
  it("lists all templates when no filter", async () => {
    prismaMock.template.findMany.mockResolvedValue([{ id: "t1" }]);
    const res = await request(app).get("/api/templates");
    expect(res.status).toBe(200);
    expect(prismaMock.template.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined })
    );
  });

  it("filters by categoryId", async () => {
    prismaMock.template.findMany.mockResolvedValue([]);
    await request(app).get("/api/templates").query({ categoryId: "c1" });
    expect(prismaMock.template.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { categoryId: "c1" } })
    );
  });
});

describe("GET /api/templates/:id", () => {
  it("returns a template with versions", async () => {
    prismaMock.template.findUnique.mockResolvedValue({ id: "t1", versions: [] });
    const res = await request(app).get("/api/templates/t1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("t1");
  });

  it("404s when not found", async () => {
    prismaMock.template.findUnique.mockResolvedValue(null);
    const res = await request(app).get("/api/templates/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("template_not_found");
  });
});

describe("POST /api/templates", () => {
  it("creates a template", async () => {
    prismaMock.template.create.mockResolvedValue({ id: "t1" });
    const res = await request(app)
      .post("/api/templates")
      .send({ slug: "welcome", name: "Welcome", categoryId: "c1" });
    expect(res.status).toBe(201);
    expect(prismaMock.template.create).toHaveBeenCalledWith({
      data: { slug: "welcome", name: "Welcome", categoryId: "c1" },
    });
  });

  it("rejects missing categoryId with 422", async () => {
    const res = await request(app).post("/api/templates").send({ slug: "welcome", name: "Welcome" });
    expect(res.status).toBe(422);
  });

  it("rejects an invalid slug with 422", async () => {
    const res = await request(app)
      .post("/api/templates")
      .send({ slug: "Bad_Slug", name: "x", categoryId: "c1" });
    expect(res.status).toBe(422);
  });
});

describe("PUT /api/templates/:id", () => {
  it("updates partially", async () => {
    prismaMock.template.update.mockResolvedValue({ id: "t1" });
    const res = await request(app).put("/api/templates/t1").send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(prismaMock.template.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { name: "Renamed" },
    });
  });
});

describe("DELETE /api/templates/:id", () => {
  it("deletes and returns 204", async () => {
    prismaMock.template.delete.mockResolvedValue({});
    const res = await request(app).delete("/api/templates/t1");
    expect(res.status).toBe(204);
  });
});
