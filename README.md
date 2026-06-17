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

## How it works
- Each version stores a **JSON Schema** describing its render params.
- On send, the payload `data` is validated against that schema (converted to a
  Zod schema at runtime — `backend/src/lib/jsonSchemaToZod.ts`), then Handlebars
  fills the MJML, MJML compiles to responsive HTML, SES sends it.
- A version names a **Sender** (a verified SES identity); the UI assigns one per version.

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
   npm run prisma:migrate -- --name init
   npm run db:seed               # seeds accounts/password-recovery/v1
   npm run dev                   # http://localhost:4000
   ```
3. Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev                   # http://localhost:5173 (proxies /api -> :4000)
   ```

## Send API

```bash
curl -X POST http://localhost:4000/accounts/password-recovery/v1 \
  -H 'content-type: application/json' \
  -d '{
    "to": "user@example.com",
    "data": { "name": "Sam", "resetUrl": "https://app/r?t=x", "expiresInMinutes": 30 }
  }'
```

Invalid `data` (wrong type, missing required field, etc.) → `422` with Zod issues.
Unpublished version → `409`. With `SES_DRY_RUN=true` nothing is sent; the payload
is logged.

## Management API (used by the UI)
- `GET/POST/PUT/DELETE /api/senders`
- `GET/POST/PUT/DELETE /api/categories`
- `GET/POST/PUT/DELETE /api/templates` (`?categoryId=`)
- `POST /api/templates/:templateId/versions` (`?from=<versionId>` to clone)
- `GET/PUT/DELETE /api/versions/:id`
- `POST /api/versions/:id/publish`
- `POST /api/versions/:id/preview` (`{ "data": {…} }` → rendered HTML)

## AWS SES notes
- Sandbox accounts can only send to verified addresses; request production access to send freely.
- Sender identities (domain or email) must be verified in the matching region.
- Credentials come from the standard AWS chain (env vars in `.env`, or an IAM role).
