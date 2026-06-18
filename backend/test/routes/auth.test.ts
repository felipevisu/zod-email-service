import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { TEST_USERNAME, TEST_PASSWORD } from "../setup.js";

// createApp pulls in the prisma-backed routers; mock prisma so importing is safe.
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

describe("POST /api/auth/login", () => {
  it("sets a session cookie on valid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: TEST_USERNAME });
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain("session=");
    expect(cookie).toContain("HttpOnly");
  });

  it("401s on a wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: TEST_USERNAME, password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_credentials");
  });

  it("401s on an unknown username", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "nobody", password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it("422s on a malformed body (missing username)", async () => {
    const res = await request(app).post("/api/auth/login").send({ password: TEST_PASSWORD });
    expect(res.status).toBe(422);
  });
});

describe("session lifecycle", () => {
  it("rejects protected routes without a session", async () => {
    const res = await request(app).get("/api/senders");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthenticated");
  });

  it("GET /api/auth/me returns the user when authenticated", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: TEST_USERNAME, password: TEST_PASSWORD });
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ username: TEST_USERNAME });
  });

  it("GET /api/auth/me is 401 without a session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("logout clears the session so protected routes 401 again", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: TEST_USERNAME, password: TEST_PASSWORD });
    prismaMock.sender.findMany.mockResolvedValue([]);
    expect((await agent.get("/api/senders")).status).toBe(200);
    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(204);
    expect((await agent.get("/api/senders")).status).toBe(401);
  });

  it("rejects a tampered/garbage session cookie", async () => {
    const res = await request(app).get("/api/senders").set("Cookie", "session=not.a.jwt");
    expect(res.status).toBe(401);
  });
});
