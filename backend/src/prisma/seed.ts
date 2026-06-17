import { prisma } from "../lib/prisma.js";

const MJML = `<mjml>
  <mj-body background-color="#f4f4f7">
    <mj-section background-color="#ffffff" padding="32px">
      <mj-column>
        <mj-text font-size="20px" font-weight="bold">Hi {{name}},</mj-text>
        <mj-text font-size="14px" color="#555">
          We received a request to reset your password. Click below to choose a new one.
        </mj-text>
        <mj-button href="{{resetUrl}}" background-color="#4f46e5">Reset password</mj-button>
        <mj-text font-size="12px" color="#999">
          This link expires in {{expiresInMinutes}} minutes. If you didn't ask for this, ignore this email.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "resetUrl", "expiresInMinutes"],
  properties: {
    name: { type: "string", description: "Recipient display name" },
    resetUrl: { type: "string", format: "url", description: "Password reset link" },
    expiresInMinutes: { type: "integer", minimum: 1, description: "Link TTL in minutes" },
  },
};

async function main() {
  const sender = await prisma.sender.upsert({
    where: { email: "no-reply@example.com" },
    update: {},
    create: { name: "Acme", email: "no-reply@example.com", region: "us-east-1" },
  });

  const category = await prisma.category.upsert({
    where: { slug: "accounts" },
    update: {},
    create: { slug: "accounts", name: "Accounts" },
  });

  const template = await prisma.template.upsert({
    where: { categoryId_slug: { categoryId: category.id, slug: "password-recovery" } },
    update: {},
    create: { slug: "password-recovery", name: "Password Recovery", categoryId: category.id },
  });

  const existing = await prisma.version.findFirst({
    where: { templateId: template.id, version: 1 },
  });
  if (!existing) {
    await prisma.version.create({
      data: {
        templateId: template.id,
        version: 1,
        subject: "Reset your password, {{name}}",
        mjml: MJML,
        jsonSchema: SCHEMA,
        senderId: sender.id,
        status: "PUBLISHED",
      },
    });
  }

  console.log("seed done: POST /accounts/password-recovery/v1");
}

main().finally(() => prisma.$disconnect());
