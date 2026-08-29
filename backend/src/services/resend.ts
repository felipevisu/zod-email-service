const DRY_RUN = process.env.SES_DRY_RUN === "true";

export type ResendArgs = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  apiKey: string;
};

export async function sendViaResend(args: ResendArgs): Promise<{ messageId: string; dryRun: boolean }> {
  if (DRY_RUN) {
    console.log("[RESEND DRY_RUN] would send:", {
      from: args.from,
      to: args.to,
      subject: args.subject,
      htmlBytes: args.html.length,
    });
    return { messageId: "dry-run", dryRun: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: args.from, to: args.to, subject: args.subject, html: args.html }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new Error(body.message ?? `Resend API error (HTTP ${res.status})`);
  return { messageId: body.id ?? "unknown", dryRun: false };
}
