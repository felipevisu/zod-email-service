import { describe, it, expect } from "vitest";
import { jsonSchemaToZod } from "../src/lib/jsonSchemaToZod.js";

describe("jsonSchemaToZod", () => {
  it("validates a string type", () => {
    const z = jsonSchemaToZod({ type: "string" });
    expect(z.parse("hi")).toBe("hi");
    expect(() => z.parse(5)).toThrow();
  });

  it("enforces string format: email", () => {
    const z = jsonSchemaToZod({ type: "string", format: "email" });
    expect(z.parse("a@b.com")).toBe("a@b.com");
    expect(() => z.parse("nope")).toThrow();
  });

  it("enforces format: url / uuid / date-time", () => {
    expect(() => jsonSchemaToZod({ type: "string", format: "url" }).parse("x")).toThrow();
    jsonSchemaToZod({ type: "string", format: "url" }).parse("https://a.com");
    expect(() => jsonSchemaToZod({ type: "string", format: "uuid" }).parse("x")).toThrow();
    expect(() =>
      jsonSchemaToZod({ type: "string", format: "date-time" }).parse("not-a-date")
    ).toThrow();
    jsonSchemaToZod({ type: "string", format: "date-time" }).parse("2026-01-01T00:00:00Z");
  });

  it("enforces minLength / maxLength", () => {
    const z = jsonSchemaToZod({ type: "string", minLength: 2, maxLength: 4 });
    expect(() => z.parse("a")).toThrow();
    expect(() => z.parse("abcde")).toThrow();
    expect(z.parse("abc")).toBe("abc");
  });

  it("validates integer with int + min/max", () => {
    const z = jsonSchemaToZod({ type: "integer", minimum: 1, maximum: 10 });
    expect(z.parse(5)).toBe(5);
    expect(() => z.parse(2.5)).toThrow();
    expect(() => z.parse(0)).toThrow();
    expect(() => z.parse(11)).toThrow();
  });

  it("validates number (non-integer allowed)", () => {
    const z = jsonSchemaToZod({ type: "number" });
    expect(z.parse(2.5)).toBe(2.5);
  });

  it("validates boolean", () => {
    const z = jsonSchemaToZod({ type: "boolean" });
    expect(z.parse(true)).toBe(true);
    expect(() => z.parse("true")).toThrow();
  });

  it("validates enum (coerced to strings)", () => {
    const z = jsonSchemaToZod({ enum: ["a", "b", 1] });
    expect(z.parse("a")).toBe("a");
    expect(z.parse("1")).toBe("1");
    expect(() => z.parse("c")).toThrow();
  });

  it("validates arrays with item schema", () => {
    const z = jsonSchemaToZod({ type: "array", items: { type: "number" } });
    expect(z.parse([1, 2])).toEqual([1, 2]);
    expect(() => z.parse([1, "x"])).toThrow();
  });

  it("validates arrays without items as any[]", () => {
    const z = jsonSchemaToZod({ type: "array" });
    expect(z.parse([1, "x", true])).toEqual([1, "x", true]);
  });

  it("treats unknown/absent type as z.any()", () => {
    const z = jsonSchemaToZod({});
    expect(z.parse({ whatever: true })).toEqual({ whatever: true });
  });

  it("handles objects with required and optional props", () => {
    const z = jsonSchemaToZod({
      type: "object",
      properties: { name: { type: "string" }, age: { type: "integer" } },
      required: ["name"],
    });
    expect(z.parse({ name: "Ann" })).toEqual({ name: "Ann" });
    expect(() => z.parse({ age: 5 })).toThrow(); // name missing
  });

  it("strict objects reject additional properties when additionalProperties=false", () => {
    const z = jsonSchemaToZod({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    });
    expect(() => z.parse({ name: "Ann", extra: 1 })).toThrow();
  });

  it("allows additional properties by default", () => {
    const z = jsonSchemaToZod({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    });
    expect(z.parse({ name: "Ann", extra: 1 })).toMatchObject({ name: "Ann" });
  });

  it("supports nested objects and arrays of objects", () => {
    const z = jsonSchemaToZod({
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "integer" } },
            required: ["id"],
          },
        },
      },
      required: ["items"],
    });
    expect(z.parse({ items: [{ id: 1 }] })).toEqual({ items: [{ id: 1 }] });
    expect(() => z.parse({ items: [{ id: "x" }] })).toThrow();
  });

  it("honors nullable", () => {
    const z = jsonSchemaToZod({ type: "string", nullable: true });
    expect(z.parse(null)).toBeNull();
    expect(z.parse("hi")).toBe("hi");
  });

  it("nullable on an object", () => {
    const z = jsonSchemaToZod({
      type: "object",
      properties: { a: { type: "string" } },
      nullable: true,
    });
    expect(z.parse(null)).toBeNull();
  });
});
