import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const DRY_RUN = process.env.SES_DRY_RUN === "true";

// One client per region, lazily created.
const clients = new Map<string, SESClient>();

function clientFor(region: string): SESClient {
  let c = clients.get(region);
  if (!c) {
    c = new SESClient({ region });
    clients.set(region, c);
  }
  return c;
}

export type SendArgs = {
  from: string; // "Name <email@domain>" or bare email
  to: string[];
  subject: string;
  html: string;
  region: string;
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

  const res = await clientFor(args.region).send(cmd);
  return { messageId: res.MessageId ?? "unknown", dryRun: false };
}
