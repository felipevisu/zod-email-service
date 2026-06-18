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

describe("GET /api/logs", () => {
  it("returns paginated items with defaults (take=50, skip=0)", async () => {
    prismaMock.emailLog.findMany.mockResolvedValue([{ id: "l1" }]);
    prismaMock.emailLog.count.mockResolvedValue(1);
    const res = await agent.get("/api/logs");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [{ id: "l1" }], total: 1, take: 50, skip: 0 });
    expect(prismaMock.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, take: 50, skip: 0, orderBy: { createdAt: "desc" } })
    );
  });

  it("builds a where clause from status/category/template filters", async () => {
    prismaMock.emailLog.findMany.mockResolvedValue([]);
    prismaMock.emailLog.count.mockResolvedValue(0);
    await agent.get("/api/logs").query({ status: "FAILED", category: "accounts", template: "welcome" });
    expect(prismaMock.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "FAILED", category: "accounts", template: "welcome" },
      })
    );
  });

  it("search matches subject OR recipient", async () => {
    prismaMock.emailLog.findMany.mockResolvedValue([]);
    prismaMock.emailLog.count.mockResolvedValue(0);
    await agent.get("/api/logs").query({ search: "user@x.com" });
    const arg = prismaMock.emailLog.findMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([
      { subject: { contains: "user@x.com", mode: "insensitive" } },
      { to: { has: "user@x.com" } },
    ]);
  });

  it("applies date range to createdAt", async () => {
    prismaMock.emailLog.findMany.mockResolvedValue([]);
    prismaMock.emailLog.count.mockResolvedValue(0);
    await agent
      .get("/api/logs")
      .query({ from: "2026-01-01", to: "2026-02-01" });
    const arg = prismaMock.emailLog.findMany.mock.calls[0][0];
    expect(arg.where.createdAt.gte).toBeInstanceOf(Date);
    expect(arg.where.createdAt.lte).toBeInstanceOf(Date);
  });

  it("coerces take/skip and rejects out-of-range take with 422", async () => {
    const res = await agent.get("/api/logs").query({ take: "999" });
    expect(res.status).toBe(422);
  });

  it("rejects an invalid status enum with 422", async () => {
    const res = await agent.get("/api/logs").query({ status: "PENDING" });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/logs/stats", () => {
  it("aggregates sent/failed/total", async () => {
    prismaMock.emailLog.groupBy.mockResolvedValue([
      { status: "SENT", _count: { _all: 7 } },
      { status: "FAILED", _count: { _all: 3 } },
    ]);
    const res = await agent.get("/api/logs/stats");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: 7, failed: 3, total: 10 });
  });

  it("defaults missing groups to zero", async () => {
    prismaMock.emailLog.groupBy.mockResolvedValue([]);
    const res = await agent.get("/api/logs/stats");
    expect(res.body).toEqual({ sent: 0, failed: 0, total: 0 });
  });
});
