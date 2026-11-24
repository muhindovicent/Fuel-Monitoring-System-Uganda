# MafutaWatch deployment guide — first backend increment

**Status: staging candidate only, not approved for production.** The PWA contains historical demonstration modules that remain local-only, and there is no authorized government source of fuel price data.

## Development / staging
1. Start PostgreSQL 16 (local Docker): `cd backend`; create a local `.env` with `MAFUTA_DB_PASSWORD` (do not commit), then `docker compose --env-file .env -f compose.dev.yml up -d`.
2. Create backend `.env` using `.env.example`. Set `DATABASE_URL=postgres://mafuta:<password>@localhost:5432/mafuta_watch`; URL-encode special characters. Use `JWT_SECRET` from a cryptographically secure random generator, 32+ characters, and allowed PWA `FRONTEND_ORIGINS`.
3. `npm install && npm run db:migrate && npm run build && npm test`; for a disposable testing DB, also `npm run test:integration`.
4. Create a single authorized administrator with `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` (16+ chars) via `npm run admin:create`. Remove bootstrap variables after creating the account. All other user roles require a deliberately authorized provisioning process (not public registration).
5. `npm start` and check `/api/v1/health`. Serve the PWA `app/` directory on HTTPS with `app/js/api-config.js` pointing to your API. Prefer a same-origin reverse proxy exposing `/api/v1`.

## Hosting example (provider-neutral)
- Deploy `backend/` as a Node.js service or Docker container, and provision a separate managed PostgreSQL 16+ instance.
- Run migrations **once** as a release step before starting the new API version (use a database role with DDL permission). The API runtime database user should not have schema-altering privileges.
- Set `NODE_ENV=production`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, and `FRONTEND_ORIGINS=https://your-verified-domain` as private environment variables in the provider dashboard.
- Serve static `app/` separately. Configure HTTPS, TLS verification for the database, an allowed origin, and a trustworthy reverse-proxy client IP policy before enabling rate limits behind a proxy.
- Ensure /health checks use the proper path and that database migrations were applied.

## Deploy/rollback checklist
- Check the GitHub Actions PostgreSQL integration workflow is green.
- Review the staged UI and confirm the CONNECTED banner is shown only for a reachable authoritative API.
- Confirm no test/mock records or hardcoded credentials are seeded into staging production tables.
- Verify log redaction, backups (including restoration test), metrics, incident ownership, and configuration separation.
- Verify all published prices have human-review audit events and publicly identify the data source and freshness.
- **Do not ship** simulated C2G, operator OTP, chat, reviews or government board as real functionality.
- For rollback, redeploy previous application image after ensuring backward compatibility of migrations; never blindly roll back schema/data.
- Before real-world public rollout, secure authorizations and regulatory/legal review (Uganda's relevant laws and agency roles), privacy/security review, real station onboarding, anti-spam protections, accessibility validation, and failover testing.

The legacy `sql/001_schema_ddl.sql` is a research design reference, not a migration.
