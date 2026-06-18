import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { h, HttpError, errorMiddleware } from "../src/lib/http.js";

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("HttpError", () => {
  it("carries status, message, details", () => {
    const e = new HttpError(404, "not_found", { id: 1 });
    expect(e.status).toBe(404);
    expect(e.message).toBe("not_found");
    expect(e.details).toEqual({ id: 1 });
    expect(e).toBeInstanceOf(Error);
  });
});

describe("h (async wrapper)", () => {
  it("passes thrown errors to next()", async () => {
    const next = vi.fn();
    const err = new Error("boom");
    const handler = h(async () => {
      throw err;
    });
    await handler({} as any, {} as any, next);
    // allow the rejected promise's .catch to run
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalledWith(err);
  });

  it("does not call next on success", async () => {
    const next = vi.fn();
    const handler = h(async (_req, res: any) => res.json({ ok: true }));
    const res = mockRes();
    await handler({} as any, res, next);
    await new Promise((r) => setImmediate(r));
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});

describe("errorMiddleware", () => {
  it("maps ZodError -> 422 validation_error with issues", () => {
    const res = mockRes();
    let zerr: z.ZodError;
    try {
      z.object({ a: z.string() }).parse({});
      throw new Error("should have thrown");
    } catch (e) {
      zerr = e as z.ZodError;
    }
    errorMiddleware(zerr!, {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "validation_error" })
    );
    const body = res.json.mock.calls[0][0];
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("maps HttpError -> its status with message + details", () => {
    const res = mockRes();
    errorMiddleware(new HttpError(409, "conflict", { hint: "x" }), {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: "conflict", details: { hint: "x" } });
  });

  it("maps unknown errors -> 500 internal_error", () => {
    const res = mockRes();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    errorMiddleware(new Error("weird"), {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "internal_error" });
    spy.mockRestore();
  });
});
