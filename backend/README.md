# MafutaWatch production foundation API (MVP)

A separate NestJS + PostgreSQL service. Existing static PWA is retained. No live data is fabricated.

## Local setup
1. Install Node.js 20+ and PostgreSQL 15+. Create an empty database and a restricted database user.
2. `cd backend && npm install`
3. Copy `.env.example` to `.env`; set `DATABASE_URL`, a randomly generated `JWT_SECRET` (32+ characters), and `FRONTEND_ORIGINS`.
4. `npm run db:migrate`
5. For an initial administrator **once only**, set `BOOTSTRAP_ADMIN_EMAIL` and a unique 16+ character `BOOTSTRAP_ADMIN_PASSWORD`, run `npm run admin:create`, then remove those two variables.
6. `npm run dev`. Check `GET http://localhost:3000/api/v1/health`.

## Endpoints
- `GET /api/v1/health` database readiness
- `GET /api/v1/stations` authoritative, verified-price-only stations (empty until provisioned)
- `POST /api/v1/auth/login` administrator or inspector authentication
- `POST /api/v1/stations` admin only, Bearer JWT
- `POST /api/v1/reports` rate-limited anonymous citizen submission; ALWAYS pending
- `GET /api/v1/admin/reports` admin/inspector/analyst pending list
- `POST /api/v1/admin/reports/:id/verify` admin/inspector, transactionally publishes
- `POST /api/v1/admin/reports/:id/reject` admin/inspector

Example station payload: `{"name":"Verified location","district":"Kampala","latitude":0.31,"longitude":32.58}`.
Example report payload: `{"stationId":1,"fuel":"petrol","price":5500,"location":"Kampala"}`.

Never use the legacy `sql/001_schema_ddl.sql` as an automatic migration. It is a design reference with incompatible partition FK and extension requirements. The MVP deliberately has no unverifiable legal price caps, fake operators, automatic approvals, or government identity claims.

## Security/release caveats
The MVP is **not production deployment approval**: complete identity verification, server-side operator onboarding, audit review, spam controls, CAPTCHA/abuse protection, privacy impact assessment, backups, source-of-truth licensing, and integration/e2e tests first. Reverse proxy must forward a trustworthy client IP; do not enable `trust proxy` for arbitrary forwarded headers. JWTs are short lived and held in memory by the PWA (no localStorage). Do not log credentials. Restrict CORS to HTTPS frontend origins in production. Migration must run as a deployment step with an authorized database role. Service requires a dedicated database identity with only necessary privileges.

Integration: execute `npm run db:migrate && npm run build && npm run test:integration` only with a disposable PostgreSQL database. Never run test fixtures against real records.
