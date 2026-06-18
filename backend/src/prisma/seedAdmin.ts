import { prisma } from "../lib/prisma.js";

/**
 * Recreates the portal admin_email plugin's staff password emails
 * (portal/plugins/admin_email/default_email_templates/*.html) as email-service
 * versions. Handlebars vars (reset_url / password_set_url) are kept; copy is
 * translated to PT-BR and the design aligned with the "documents" templates:
 * dark #101828 logo header, red #F21C3F CTA, px units (MJML rejects rem).
 */

const LOGO =
  "https://publicidadedacidade-visualize.s3.us-east-1.amazonaws.com/static/images/logo-dark.png";

const header = `    <mj-section background-color="#101828" padding="20px">
      <mj-column>
        <mj-image src="${LOGO}" alt="Publicidade da Cidade" align="center" padding="0" />
      </mj-column>
    </mj-section>`;

const footerThanks = `        <mj-divider border-width="1px" border-color="#e5e7eb" padding="16px 0" />
        <mj-text font-size="14px" color="#101828" line-height="1.5">Obrigado,<br/>Publicidade da Cidade.</mj-text>
        <mj-text font-size="12px" color="#6b7280" line-height="1.5">Este e-mail foi enviado automaticamente. Por favor, não responda.</mj-text>`;

function wrap(preview: string, body: string): string {
  return `<mjml>
  <mj-head>
    <mj-preview>${preview}</mj-preview>
  </mj-head>
  <mj-body background-color="#ffffff">
${header}
    <mj-section padding="24px">
      <mj-column>
        <mj-text font-size="14px" color="#101828" line-height="1.5">Olá,</mj-text>
${body}
${footerThanks}
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
}

const text = (s: string) =>
  `        <mj-text font-size="14px" color="#101828" line-height="1.5">${s}</mj-text>`;

const cta = (href: string, label: string) =>
  `        <mj-button href="${href}" background-color="#F21C3F" color="#ffffff" border-radius="6px" font-weight="bold" align="center" padding="20px 0">${label}</mj-button>
        <mj-text font-size="12px" color="#6b7280" align="center" line-height="1.5">Se o botão não funcionar, copie e cole este link no navegador:<br/><a href="${href}" style="color:#F21C3F; word-break:break-all;">${href}</a></mj-text>`;

// --- staff-password-reset (password_reset.html) --------------------------
const PASSWORD_RESET = wrap(
  "Redefina a senha do seu painel.",
  [
    text("Recebemos sua solicitação de redefinição de senha do painel."),
    text(
      "Para redefinir sua senha, clique no botão &ldquo;Redefinir senha&rdquo; abaixo."
    ),
    cta("{{reset_url}}", "Redefinir senha"),
    text(
      "Este link expira em 24 horas. Caso perca o prazo, solicite a redefinição novamente."
    ),
    text(
      "Não solicitou a redefinição? Ignore esta mensagem (ou responda para nos avisar)."
    ),
  ].join("\n")
);

// --- set-staff-password (set_password.html) ------------------------------
const SET_PASSWORD = wrap(
  "Defina a senha do seu painel.",
  [
    text(
      "Você recebeu este e-mail porque precisa definir a senha da sua conta de usuário do painel."
    ),
    text(
      "Para definir sua senha, clique no botão &ldquo;Definir senha&rdquo; abaixo."
    ),
    cta("{{password_set_url}}", "Definir senha"),
  ].join("\n")
);

type Def = {
  slug: string;
  name: string;
  subject: string;
  mjml: string;
  jsonSchema: object;
};

const urlOnly = (key: string, desc: string) => ({
  type: "object",
  additionalProperties: false,
  required: [key],
  properties: {
    [key]: { type: "string", format: "url", description: desc },
  },
});

const TEMPLATES: Def[] = [
  {
    slug: "staff-password-reset",
    name: "Redefinir senha do painel",
    subject: "Redefinir senha do painel",
    mjml: PASSWORD_RESET,
    jsonSchema: urlOnly("reset_url", "Link de redefinição de senha"),
  },
  {
    slug: "set-staff-password",
    name: "Definir senha do painel",
    subject: "Defina a senha do seu painel",
    mjml: SET_PASSWORD,
    jsonSchema: urlOnly("password_set_url", "Link para definir a senha"),
  },
];

async function main() {
  const sender = await prisma.sender.upsert({
    where: { email: "no-reply@publicidadedacidade.com.br" },
    update: {},
    create: {
      name: "Publicidade da Cidade",
      email: "no-reply@publicidadedacidade.com.br",
      region: "us-east-1",
    },
  });

  const category = await prisma.category.upsert({
    where: { slug: "admin" },
    update: {},
    create: { slug: "admin", name: "Admin" },
  });

  for (const t of TEMPLATES) {
    const template = await prisma.template.upsert({
      where: { categoryId_slug: { categoryId: category.id, slug: t.slug } },
      update: { name: t.name },
      create: { slug: t.slug, name: t.name, categoryId: category.id },
    });

    const version = await prisma.version.findFirst({
      where: { templateId: template.id, version: 1 },
    });
    if (version) {
      // keep idempotent re-runs in sync with the latest design/copy
      await prisma.version.update({
        where: { id: version.id },
        data: { subject: t.subject, mjml: t.mjml, jsonSchema: t.jsonSchema },
      });
    } else {
      await prisma.version.create({
        data: {
          templateId: template.id,
          version: 1,
          subject: t.subject,
          mjml: t.mjml,
          jsonSchema: t.jsonSchema,
          senderId: sender.id,
          status: "PUBLISHED",
        },
      });
    }
    console.log(`seeded admin/${t.slug}/v1`);
  }
}

main().finally(() => prisma.$disconnect());
