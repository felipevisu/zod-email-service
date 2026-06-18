# Email Service

Manage AWS SES email templates with versioned schema registries, and send them
over a versioned REST API.

```
Category (group, e.g. "accounts")
└── Template (email, e.g. "password-recovery")
    └── Version (v1, v2, … — MJML + subject + JSON-Schema params + sender)
```

Every schema/template change lives in a **version**. Published versions are
immutable — to change one you clone it into a new version. Other services send
mail by hitting `POST /:category/:template/:version`, e.g.
`POST /accounts/password-recovery/v1`.

## Stack
- **Backend**: TypeScript, Express, Prisma (PostgreSQL), Zod, MJML + Handlebars, AWS SES SDK
- **Frontend**: TypeScript, React, Vite, Tailwind, TanStack Query
- **Auth**: jose (JWT), bcryptjs; **Tests**: Vitest + Supertest

## How it works
- Each version stores a **JSON Schema** describing its render params.
- On send, the payload `data` is validated against that schema (converted to a
  Zod schema at runtime — `backend/src/lib/jsonSchemaToZod.ts`), then Handlebars
  fills the MJML, MJML compiles to responsive HTML, SES sends it.
- A version names a **Sender** (a verified SES identity); the UI assigns one per version.
- Every send attempt (success or failure) is recorded in an **EmailLog**, including
  which API key sent it.

## Two trust boundaries

| Surface | Who | Auth |
|---------|-----|------|
| Management UI + `/api/*` | humans (browser) | login → JWT in httpOnly cookie |
| Send API `/:category/:template/:version` | internal services | `X-Api-Key` (DB-backed key) |

The send API is **not** gated by user login; it uses API keys created from the
dashboard. There is no env-based send secret.

## Run

1. Start Postgres:
   ```bash
   docker compose up -d
   ```
2. Backend:
   ```bash
   cd backend
   cp .env.example .env          # SES_DRY_RUN=true logs instead of sending
   npm install
   npm run prisma:migrate        # applies migrations
   npm run db:seed               # seeds accounts/password-recovery/v1

   # set up the admin login (see "Auth" below)
   npm run auth:hash -- "your-password"   # paste output into ADMIN_PASSWORD_HASH
   #   also set ADMIN_USERNAME and a random JWT_SECRET in .env

   npm run dev                   # http://localhost:4000
   ```
3. Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev                   # http://localhost:5173 (proxies /api -> :4000)
   ```
4. First use: open the UI, **sign in**, go to **API keys → Create**, copy the
   key (shown once), and pass it as `X-Api-Key` when calling the send API.

## Auth (management UI / API)

Login is username + password against env-configured admin credentials. A
successful login sets a signed JWT in an httpOnly cookie; `/api/*` (except
`/api/auth/login`) requires it.

`.env`:
```
JWT_SECRET=<long random string>
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<bcrypt hash>      # from: npm run auth:hash -- "your-password"
```

Endpoints: `POST /api/auth/login` `{username,password}`, `POST /api/auth/logout`,
`GET /api/auth/me`.

## API keys (send authorization)

Keys are created in the dashboard and stored in the database (only a SHA-256 hash
of the secret is kept; the raw key is shown once at creation).

- **Scope**: `ALL` (any template) or `SELECTED` (a fixed set of templates). Scope
  is **immutable** — to change access, revoke and create a new key.
- **Expiry**: a date, or permanent.
- **Revoke** (soft) or **delete**. Usage is tracked via `lastUsedAt`.

Endpoints (behind login): `GET/POST /api/api-keys`, `POST /api/api-keys/:id/revoke`,
`DELETE /api/api-keys/:id`.

## Send API

```bash
curl -X POST http://localhost:4000/accounts/password-recovery/v1 \
  -H 'content-type: application/json' \
  -H 'x-api-key: es_xxxx_xxxxxxxx' \
  -d '{
    "to": "user@example.com",
    "data": { "name": "Sam", "resetUrl": "https://app/r?t=x", "expiresInMinutes": 30 }
  }'
```

The key may also be passed as `Authorization: Bearer es_...`.

Failure modes: missing/invalid key → `401`; key not scoped to the template →
`403`; invalid `data` (wrong type, missing required field) → `422` with Zod
issues; unpublished version → `409`; MJML render error → `500`. With
`SES_DRY_RUN=true` nothing is sent; the payload is logged.

## Management API (used by the UI)

All require a session cookie.

- `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me`
- `GET/POST /api/api-keys` · `POST /api/api-keys/:id/revoke` · `DELETE /api/api-keys/:id`
- `GET/POST/PUT/DELETE /api/senders`
- `GET/POST/PUT/DELETE /api/categories`
- `GET/POST/PUT/DELETE /api/templates` (`?categoryId=`)
- `POST /api/templates/:templateId/versions` (`?from=<versionId>` to clone)
- `GET/PUT/DELETE /api/versions/:id`
- `POST /api/versions/:id/publish`
- `POST /api/versions/:id/preview` (`{ "data": {…} }` → rendered HTML)
- `GET /api/logs` (filters: `status`, `category`, `template`, `search`, `from`, `to`, `take`, `skip`)
- `GET /api/logs/stats`

## Tests

```bash
cd backend
npm test                 # vitest
npm run test:coverage    # with coverage
```

Routes are tested with Supertest against the Express app; Prisma and SES are
mocked, so no live database or AWS is required.

## AWS SES notes
- Sandbox accounts can only send to verified addresses; request production access to send freely.
- Sender identities (domain or email) must be verified in the matching region.
- Credentials come from the standard AWS chain (env vars in `.env`, or an IAM role).
```
