# MafutaWatch Uganda

Fuel-price transparency, verified operator updates, and tracked consumer complaints. Version 3 replaces the browser-only demonstration with a Node.js API and PostgreSQL persistence.

## What works

- Public station directory/map, fuel-specific sorting, GPS radius search, price provenance/freshness and accepted-price history.
- Citizen accounts, price observations, independently verified-citizen consensus, manual outlier review and private activity/notifications.
- Consumer complaints, private evidence uploads/downloads, case conversations, staff assignment, validated transitions and a server-owned 24h response target.
- Station-access applications with license evidence and manual approval; assigned operators publish audited pump prices and issue/revoke station-scoped integration credentials.
- Real operations metrics, role-aware workspaces, append-only audit records, source-linked advisories, effective/expiring district directives, corridor messages and scheduled town-hall questions/responses.
- Responsive keyboard-accessible UI, offline shell, explicit unavailable/error states and no cached private API responses.

No default passwords, invented government releases, fabricated analytics, browser-controlled roles or simulated SMS delivery are included. Demo station fixtures are optional, explicitly labeled, excluded from live price analytics, and blocked from production seeding.

## Requirements

- Node.js 24 LTS and npm.
- PostgreSQL 17 (16+ should be compatible; CI targets 17). No extensions required.
- Docker Engine + Compose v2 for the supplied deployment, or a managed PostgreSQL service and Node host.

## Local development

1. Install dependencies: `npm ci`.
2. Create a PostgreSQL database and schema-owner/runtime users. See [`deploy/init-db.sh`](deploy/init-db.sh) and [`deploy/runtime-grants.sql`](deploy/runtime-grants.sql) for grants.
3. Copy `.env.example` to `.env`, set `DATABASE_URL`, `MIGRATION_DATABASE_URL` and `APP_ORIGIN=http://localhost:3000`.
4. Run `npm run db:migrate`.
5. Optionally run `npm run db:seed` **only for demonstration data in development**.
6. Provision an administrator. Supply a unique password through the `USER_PASSWORD` environment variable, then run:

   ```text
   npm run db:user -- admin@example.org admin "Platform administrator"
   ```

   Remove `USER_PASSWORD` from your shell environment afterward. The CLI also provisions `inspector`, `analyst`, `operator`, and `citizen` accounts or resets an existing account; it revokes previous sessions and API credentials.

7. Run `npm run dev` and open **http://localhost:3000**. The server serves `app/` at `/`; opening HTML directly bypasses the API and is unsupported.

Public registration creates only citizen accounts. Operators request access through the station workspace; an administrator verifies license evidence and approves their named station. Official staff accounts are provisioned using the CLI.

## Verification

```text
npm run check
npx playwright install chromium
npm run test:e2e
npm audit --audit-level=moderate
```

`npm test` uses an isolated embedded PostgreSQL engine (PGlite). To run the same suite against native PostgreSQL, set `TEST_DATABASE_URL` to a disposable database named **mafuta_test**. Tests reset that database's public schema. CI runs both variants. Browser tests have their own isolated fixtures and must not inherit `TEST_DATABASE_URL`.

On a machine with an installed compatible Chrome/Edge, `PLAYWRIGHT_CHANNEL=chrome` or `msedge` can avoid downloading a test browser. See [`docs/11_VERIFICATION.md`](docs/11_VERIFICATION.md) for recorded local results and limits.

## Deployment

Follow [`docs/10_OPERATIONS.md`](docs/10_OPERATIONS.md) for HTTPS Compose deployment, migrations, privileged-account provisioning, backups/restores, logging, credential rotation and release procedure. `.env` is excluded from version control and container images. Never use demo fixtures as an operational station register.

## Architecture and review

| Resource | Purpose |
|---|---|
| [`docs/08_REVIEW.md`](docs/08_REVIEW.md) | Baseline bugs/security review with evidence and remediation |
| [`docs/09_ARCHITECTURE.md`](docs/09_ARCHITECTURE.md) | Implemented architecture, entities, access matrix and workflows |
| [`docs/12_API.md`](docs/12_API.md) | API endpoint inventory and integration examples |
| `server/migrations/` | Executable, checksummed PostgreSQL migrations |
| `server/` | API, authorization, transactional pricing and administrative CLI |
| `app/` | API-backed PWA frontend |
| `test/` | Regression and real-browser workflows |

The original architecture papers, documentation HTML and `docs/reference/legacy_schema.sql` are retained as **historical design references**, not executable deployment instructions. The original Kafka/Redis/USSD/WhatsApp microservices and national-capacity targets were proposals. External delivery channels, operator identity integrations, production station records and regulatory directives require real providers/source records and operational validation.
