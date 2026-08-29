import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const DRY_RUN = process.env.SES_DRY_RUN === "true";

export type SesCredentials = { accessKeyId: string; secretAccessKey: string };

// One client per region + key, lazily created.
const clients = new Map<string, SESClient>();

function clientFor(region: string, credentials?: SesCredentials): SESClient {
  const cacheKey = `${region}:${credentials?.accessKeyId ?? ""}`;
  let c = clients.get(cacheKey);
  if (!c) {
    // No explicit credentials -> AWS SDK default chain (env vars, IAM role, …).
    c = new SESClient({ region, ...(credentials ? { credentials } : {}) });
    clients.set(cacheKey, c);
  }
  return c;
}

export type SendArgs = {
  from: string; // "Name <email@domain>" or bare email
  to: string[];
  subject: string;
  html: string;
  region: string;
  credentials?: SesCredentials;
};

export async function sendEmail(args: SendArgs): Promise<{ messageId: string; dryRun: boolean }> {
  if (DRY_RUN) {
    console.log("[SES DRY_RUN] would send:", {
      from: args.from,
      to: args.to,
      subject: args.subject,
      htmlBytes: args.html.length,
    });
    return { messageId: "dry-run", dryRun: true };
  }

  const cmd = new SendEmailCommand({
    Source: args.from,
    Destination: { ToAddresses: args.to },
    Message: {
      Subject: { Data: args.subject, Charset: "UTF-8" },
      Body: { Html: { Data: args.html, Charset: "UTF-8" } },
    },
  });

  const res = await clientFor(args.region, args.credentials).send(cmd);
  return { messageId: res.MessageId ?? "unknown", dryRun: false };
}
