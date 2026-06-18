import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Capture the constructor + send calls.
const sendMock = vi.fn();
const ctorMock = vi.fn();

vi.mock("@aws-sdk/client-ses", () => ({
  SESClient: class {
    region: string;
    constructor(cfg: { region: string }) {
      ctorMock(cfg);
      this.region = cfg.region;
    }
    send(cmd: unknown) {
      return sendMock(cmd, this.region);
    }
  },
  SendEmailCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

const args = {
  from: "Acme <no-reply@acme.com>",
  to: ["a@b.com"],
  subject: "Hi",
  html: "<html></html>",
  region: "eu-west-1",
};

beforeEach(() => {
  vi.resetModules();
  sendMock.mockReset();
  ctorMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendEmail — dry run", () => {
  it("returns dry-run and never touches SES when SES_DRY_RUN=true", async () => {
    vi.stubEnv("SES_DRY_RUN", "true");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendEmail } = await import("../src/services/ses.js");
    const res = await sendEmail(args);
    expect(res).toEqual({ messageId: "dry-run", dryRun: true });
    expect(sendMock).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("sendEmail — live", () => {
  it("sends via SES and returns the message id", async () => {
    vi.stubEnv("SES_DRY_RUN", "false");
    sendMock.mockResolvedValue({ MessageId: "abc-123" });
    const { sendEmail } = await import("../src/services/ses.js");
    const res = await sendEmail(args);
    expect(res).toEqual({ messageId: "abc-123", dryRun: false });
    expect(ctorMock).toHaveBeenCalledWith({ region: "eu-west-1" });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to 'unknown' when SES omits MessageId", async () => {
    vi.stubEnv("SES_DRY_RUN", "false");
    sendMock.mockResolvedValue({});
    const { sendEmail } = await import("../src/services/ses.js");
    const res = await sendEmail(args);
    expect(res.messageId).toBe("unknown");
  });

  it("reuses one client per region (lazy cache)", async () => {
    vi.stubEnv("SES_DRY_RUN", "false");
    sendMock.mockResolvedValue({ MessageId: "x" });
    const { sendEmail } = await import("../src/services/ses.js");
    await sendEmail(args);
    await sendEmail(args); // same region -> no new client
    await sendEmail({ ...args, region: "us-east-1" }); // new region -> new client
    expect(ctorMock).toHaveBeenCalledTimes(2);
  });

  it("propagates SES errors", async () => {
    vi.stubEnv("SES_DRY_RUN", "false");
    sendMock.mockRejectedValue(new Error("Throttling"));
    const { sendEmail } = await import("../src/services/ses.js");
    await expect(sendEmail(args)).rejects.toThrow("Throttling");
  });
});
