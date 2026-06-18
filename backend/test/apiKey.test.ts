import { describe, it, expect } from "vitest";
import { generateApiKey, parseApiKey, secretMatches, isActive } from "../src/lib/apiKeys.js";

describe("generateApiKey", () => {
  it("produces es_<prefix>_<secret> with a matching hash and masked hint", () => {
    const k = generateApiKey();
    expect(k.raw).toMatch(/^es_[0-9a-f]+_[0-9a-f]+$/);
    const parsed = parseApiKey(k.raw)!;
    expect(parsed.prefix).toBe(k.prefix);
    expect(secretMatches(parsed.secret, k.hashedKey)).toBe(true);
    expect(k.hint.startsWith(`es_${k.prefix}`)).toBe(true);
    expect(k.hint).not.toContain(parsed.secret); // hint never reveals the secret
  });

  it("generates unique keys", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.prefix).not.toBe(b.prefix);
    expect(a.hashedKey).not.toBe(b.hashedKey);
  });
});

describe("parseApiKey", () => {
  it("rejects malformed keys", () => {
    expect(parseApiKey("garbage")).toBeNull();
    expect(parseApiKey("es_only")).toBeNull();
    expect(parseApiKey("es_xy_ZZ")).toBeNull(); // non-hex
    expect(parseApiKey("")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    const k = generateApiKey();
    expect(parseApiKey(`  ${k.raw}\n`)?.prefix).toBe(k.prefix);
  });
});

describe("secretMatches", () => {
  it("is false for a wrong secret and for length mismatch", () => {
    const k = generateApiKey();
    expect(secretMatches("deadbeef", k.hashedKey)).toBe(false);
    expect(secretMatches("", k.hashedKey)).toBe(false);
  });
});

describe("isActive", () => {
  const now = new Date("2026-06-18T12:00:00Z");
  it("active when not revoked and no expiry", () => {
    expect(isActive({ revokedAt: null, expiresAt: null }, now)).toBe(true);
  });
  it("active when expiry is in the future", () => {
    expect(isActive({ revokedAt: null, expiresAt: new Date("2026-07-01") }, now)).toBe(true);
  });
  it("inactive when revoked", () => {
    expect(isActive({ revokedAt: new Date("2026-06-01"), expiresAt: null }, now)).toBe(false);
  });
  it("inactive when expired", () => {
    expect(isActive({ revokedAt: null, expiresAt: new Date("2026-06-01") }, now)).toBe(false);
  });
  it("inactive exactly at expiry", () => {
    expect(isActive({ revokedAt: null, expiresAt: now }, now)).toBe(false);
  });
});
