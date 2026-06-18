const BASE = "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(body?.error ?? `HTTP ${status}`);
  }
}

export const api = {
  get: <T>(p: string) => req<T>(p),
  post: <T>(p: string, body?: unknown) => req<T>(p, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: <T>(p: string, body?: unknown) => req<T>(p, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  del: (p: string) => req<void>(p, { method: "DELETE" }),
};

// ---- Types (mirror the Prisma models) ----
export type Sender = { id: string; name: string; email: string; region: string };
export type Category = { id: string; slug: string; name: string; _count?: { templates: number } };
export type Template = {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  category?: Category;
  _count?: { versions: number };
  versions?: Version[];
};
export type VersionStatus = "DRAFT" | "PUBLISHED";
export type Version = {
  id: string;
  version: number;
  templateId: string;
  subject: string;
  mjml: string;
  jsonSchema: any;
  senderId: string | null;
  sender?: Sender | null;
  status: VersionStatus;
  template?: Template;
};
export type RenderResult = { html: string; subject: string; errors: string[] };

export type EmailStatus = "SENT" | "FAILED";
export type EmailLog = {
  id: string;
  status: EmailStatus;
  to: string[];
  subject: string;
  category: string;
  template: string;
  version: number;
  senderEmail: string | null;
  messageId: string | null;
  dryRun: boolean;
  errorCode: string | null;
  errorDetail: string | null;
  versionId: string | null;
  createdAt: string;
};
export type LogsResponse = { items: EmailLog[]; total: number; take: number; skip: number };
export type LogStats = { sent: number; failed: number; total: number };
