import Handlebars from "handlebars";
import mjml2html from "mjml";

export type RenderResult = {
  html: string;
  subject: string;
  errors: string[];
};

/**
 * Render pipeline: Handlebars interpolates the params into the MJML source and
 * the subject, then MJML compiles to responsive HTML.
 */
export function render(
  mjmlSource: string,
  subjectTemplate: string,
  data: Record<string, unknown>
): RenderResult {
  const errors: string[] = [];

  const subject = Handlebars.compile(subjectTemplate, { noEscape: true })(data);
  const filledMjml = Handlebars.compile(mjmlSource)(data);

  // @types/mjml mistypes the sync API as returning a Promise; mjml@4 is synchronous.
  const { html, errors: mjmlErrors } = mjml2html(filledMjml, {
    validationLevel: "soft",
  }) as unknown as { html: string; errors: { formattedMessage: string }[] };
  for (const e of mjmlErrors) errors.push(e.formattedMessage);

  return { html, subject, errors };
}
