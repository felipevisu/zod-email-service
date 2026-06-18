import { prisma } from "../lib/prisma.js";

/**
 * Recreates the portal's "documents" emails (portal/templates/documents/*.html)
 * as email-service versions: MJML + Handlebars + JSON Schema. The portal sends
 * plain HTML; here each is converted to responsive MJML keeping the same logo
 * header, red CTA, preheader, copy and Handlebars vars.
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
${body}
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
}

const cta = (label: string) =>
  `        <mj-button href="{{url}}" background-color="#F21C3F" color="#ffffff" border-radius="6px" font-weight="bold" align="center" padding="20px 0">${label}</mj-button>
        <mj-text font-size="12px" color="#6b7280" align="center" line-height="1.5">Se o botão não funcionar, copie e cole este link no navegador:<br/><a href="{{url}}" style="color:#F21C3F; word-break:break-all;">{{url}}</a></mj-text>`;

// --- document-declined ---------------------------------------------------
const DECLINED = wrap(
  "Documento reprovado.",
  `        <mj-text font-size="14px" color="#101828" line-height="1.5">Olá,</mj-text>
        <mj-text font-size="14px" color="#101828" line-height="1.5">Seu documento <strong>{{document_name}}</strong> não foi aprovado, nossa equipe entrará em contato para esclarecer a situação.</mj-text>
${footerThanks}`
);

// --- document-approved ---------------------------------------------------
const APPROVED = wrap(
  "Documento aprovado.",
  `        <mj-text font-size="14px" color="#101828" line-height="1.5">Olá,</mj-text>
        <mj-text font-size="14px" color="#101828" line-height="1.5">Seu documento <strong>{{document_name}}</strong> foi aprovado, agradecemos o envio.</mj-text>
${footerThanks}`
);

// --- new-document-received ----------------------------------------------
const RECEIVED = wrap(
  "Novo documento recebido para {{entry_name}} — Avalie o documento no portal.",
  `        <mj-text font-size="14px" color="#101828" line-height="1.5">Olá,</mj-text>
        <mj-text font-size="14px" color="#101828" line-height="1.5">Você recebeu um novo documento <strong>{{document_name}}</strong> para o cadastro <strong>{{entry_name}}</strong>, enviado pelo responsável.</mj-text>
        <mj-text font-size="14px" color="#101828" line-height="1.5">Acesse o link abaixo para <strong>aprovar ou rejeitar</strong> o documento:</mj-text>
${cta("Avaliar documento")}
${footerThanks}`
);

// --- request-new-document ------------------------------------------------
const REQUEST = wrap(
  "Solicitação de novo documento para {{entry_name}} — Documento será exibido no site público.",
  `        <mj-text font-size="14px" color="#101828" line-height="1.5">Olá,</mj-text>
        <mj-text font-size="14px" color="#101828" line-height="1.5">O Departamento de Cadastro da Agência Visualize, por meio do Portal <b>Publicidade da Cidade</b>, solicita o envio de um novo documento para atualização do cadastro: <strong>{{entry_name}}</strong>.</mj-text>
        <mj-text font-size="14px" color="#101828" line-height="1.5">Documento solicitado: <strong>{{document_name}}</strong>.</mj-text>
        <mj-text font-size="14px" color="#101828" line-height="1.5">Clique no botão abaixo para acessar o formulário e enviar o documento.</mj-text>
${cta("Enviar documento")}
        <mj-text font-size="14px" color="#101828" line-height="1.5">Lembramos que o documento enviado será exibido no site público e ficará acessível a qualquer pessoa, conforme Leis da Transparência e a da Informação.</mj-text>
        <mj-divider border-width="1px" border-color="#e5e7eb" padding="16px 0" />
        <mj-text font-size="14px" color="#101828" line-height="1.5">Em caso de dúvidas, entre em contato: <a style="color:#F21C3F" href="mailto:contato@visualizecomunicacao.com.br">contato@visualizecomunicacao.com.br</a></mj-text>
        <mj-text font-size="14px" color="#101828" line-height="1.5">Obrigado,<br/>Publicidade da Cidade.</mj-text>
        <mj-text font-size="12px" color="#6b7280" line-height="1.5">Este e-mail foi enviado automaticamente. Por favor, não responda.</mj-text>`
);

const nameOnly = (desc: string) => ({
  type: "object",
  additionalProperties: false,
  required: ["document_name"],
  properties: {
    document_name: { type: "string", description: desc },
  },
});

const withUrl = (extra: Record<string, unknown>, required: string[]) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties: {
    document_name: { type: "string", description: "Document name" },
    entry_name: { type: "string", description: "Cadastro / entry name" },
    url: { type: "string", format: "url", description: "Action link" },
    ...extra,
  },
});

type Def = {
  slug: string;
  name: string;
  subject: string;
  mjml: string;
  jsonSchema: object;
};

const TEMPLATES: Def[] = [
  {
    slug: "document-declined",
    name: "Documento reprovado",
    subject: "Documento reprovado: {{document_name}}",
    mjml: DECLINED,
    jsonSchema: nameOnly("Declined document name"),
  },
  {
    slug: "document-approved",
    name: "Documento aprovado",
    subject: "Documento aprovado: {{document_name}}",
    mjml: APPROVED,
    jsonSchema: nameOnly("Approved document name"),
  },
  {
    slug: "new-document-received",
    name: "Novo documento recebido",
    subject: "Novo documento recebido para {{entry_name}}",
    mjml: RECEIVED,
    jsonSchema: withUrl({}, ["document_name", "entry_name", "url"]),
  },
  {
    slug: "request-new-document",
    name: "Solicitação de novo documento",
    subject: "Solicitação de novo documento para {{entry_name}}",
    mjml: REQUEST,
    jsonSchema: withUrl({}, ["entry_name", "document_name", "url"]),
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
    where: { slug: "documents" },
    update: {},
    create: { slug: "documents", name: "Documents" },
  });

  for (const t of TEMPLATES) {
    const template = await prisma.template.upsert({
      where: { categoryId_slug: { categoryId: category.id, slug: t.slug } },
      update: {},
      create: { slug: t.slug, name: t.name, categoryId: category.id },
    });

    const existing = await prisma.version.findFirst({
      where: { templateId: template.id, version: 1 },
    });
    if (!existing) {
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
    console.log(`seeded documents/${t.slug}/v1`);
  }
}

main().finally(() => prisma.$disconnect());
