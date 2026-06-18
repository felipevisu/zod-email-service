const BASE = "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...init,
  });
  // A 401 on anything other than the login probe means the session is gone;
  // let the auth layer drop back to the login screen.
  if (res.status === 401 && !path.startsWith("/auth/login")) {
    window.dispatchEvent(new Event("auth:unauthorized"));
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export type AuthUser = { username: string };

export const auth = {
  me: () => req<AuthUser>("/auth/me"),
  login: (username: string, password: string) =>
    req<AuthUser>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => req<void>("/auth/logout", { method: "POST" }),
};

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

export type ApiKeyScope = "ALL" | "SELECTED";
export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  hint: string;
  scope: ApiKeyScope;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  templates: { template: { id: string; slug: string; name: string } }[];
};
// Returned only by create: includes the raw key, shown to the user once.
export type CreatedApiKey = ApiKey & { key: string };

export type CreateApiKeyInput = {
  name: string;
  scope: ApiKeyScope;
  templateIds?: string[];
  expiresAt?: string; // ISO; omit for permanent
};

export const apiKeys = {
  list: () => api.get<ApiKey[]>("/api-keys"),
  create: (body: CreateApiKeyInput) => api.post<CreatedApiKey>("/api-keys", body),
  revoke: (id: string) => api.post<ApiKey>(`/api-keys/${id}/revoke`),
  remove: (id: string) => api.del(`/api-keys/${id}`),
};
