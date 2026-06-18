import { describe, it, expect } from "vitest";
import { render } from "../src/services/render.js";

const MJML = `<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{name}}</mj-text></mj-column></mj-section></mj-body></mjml>`;

describe("render", () => {
  it("interpolates Handlebars vars into subject and body, compiles MJML to HTML", () => {
    const out = render(MJML, "Hi {{name}}", { name: "Ann" });
    expect(out.subject).toBe("Hi Ann");
    expect(out.html).toContain("Hello Ann");
    expect(out.html).toContain("<html");
    expect(out.errors).toEqual([]);
  });

  it("does not HTML-escape the subject (noEscape)", () => {
    const out = render(MJML, "Hi {{name}}", { name: "A & B" });
    expect(out.subject).toBe("Hi A & B");
  });

  it("HTML-escapes body interpolation", () => {
    const out = render(MJML, "s", { name: "<script>" });
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).not.toContain("<script>");
  });

  it("leaves missing vars blank without throwing", () => {
    const out = render(MJML, "Hi {{name}}", {});
    expect(out.subject).toBe("Hi ");
    expect(out.errors).toEqual([]);
  });

  it("collects MJML validation errors for invalid markup", () => {
    const out = render(`<mjml><mj-body><mj-text>bad</mj-text></mj-body></mjml>`, "s", {});
    expect(Array.isArray(out.errors)).toBe(true);
    expect(out.errors.length).toBeGreaterThan(0);
  });
});
