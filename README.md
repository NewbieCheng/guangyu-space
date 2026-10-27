# Guangyu Space

Guangyu Space is a personal operations workspace for independent founders and one-person companies. Each account owns an isolated ledger for customers, partners, projects, tasks, orders, income, materials, experience, products, and reviews. Authorized agents can use scoped API credentials to work with the same records.

The current v0.1.0 target runs as a local web app with PostgreSQL 16 and Redis 7. It does not enable the starter framework's billing, marketing, email, AI, analytics, or cloud-storage modules.

## Local development

Requirements: Node.js 22, Corepack, Docker Desktop, and Docker Compose.

1. Copy `.env.example` to `.env` and replace `AUTH_SECRET` with a random value of at least 32 bytes.
2. Start the local data services:

   ```sh
   docker compose -f docker-compose.yml -f compose.local.yml up -d postgres redis
   ```

3. Install dependencies, apply migrations, and start the web app:

   ```sh
   corepack pnpm install --frozen-lockfile
   corepack pnpm db:migrate
   corepack pnpm dev
   ```

4. Visit <http://127.0.0.1:3000> and register an account. No demo account or sample business records are preloaded.

Windows users can edit `.env` and run [`scripts/start-local-windows.bat`](./scripts/start-local-windows.bat). See [`docs/本地部署与安全运维.md`](./docs/本地部署与安全运维.md) and [`docs/Agent-API.md`](./docs/Agent-API.md) for agent access, local material opening, backup and restore, and deployment guidance.

This repository documents Windows deployment paths but has not been validated on Windows or a production host. Never commit `.env`, backups, or real business data.
