# syntax=docker/dockerfile:1

# 1. Build the frontend (Vite -> static files).
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Build the backend (tsc -> dist) and generate the Prisma client.
FROM node:22-slim AS backend
WORKDIR /app/backend
# Prisma needs OpenSSL to pick the right query-engine binary at generate time.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run prisma:generate && npm run build

# 3. Runtime image: backend prod deps + compiled output + frontend build.
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
# Prod deps + the Prisma CLI (devDep, but needed for `migrate deploy` at boot).
RUN npm ci --omit=dev && npm install --no-save prisma@^5.20.0

# Prisma client + schema/migrations (needed for `migrate deploy` at start).
COPY --from=backend /app/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=backend /app/backend/node_modules/@prisma ./node_modules/@prisma
COPY backend/prisma ./prisma

COPY --from=backend /app/backend/dist ./dist
COPY --from=frontend /app/frontend/dist ./public

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy; node dist/index.js"]
