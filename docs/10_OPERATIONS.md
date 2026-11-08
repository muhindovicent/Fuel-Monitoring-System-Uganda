# Deployment and operating runbook

## HTTPS Compose deployment

1. Provision a Linux host with Docker Engine/Compose v2, a domain pointed at it, ports 80/443 open and persistent disk monitoring. Do not expose port 5432 or the API directly.
2. Create `.env` from `.env.example`. Set:
   - `APP_ORIGIN=https://fuel.example.org` (exact origin, no trailing slash).
   - `SITE_ADDRESS=fuel.example.org` (Caddy obtains/renews TLS).
   - Three **distinct**, randomly generated secrets: `POSTGRES_PASSWORD`, `DB_OWNER_PASSWORD`, `DB_APP_PASSWORD`. Use 64 hex characters so credentials remain URL-safe in the supplied connection URLs.
   - Optional dedicated `ROUTING_URL=https://routing.example.org`. Blank uses manually entered road distance.
3. Run `docker compose config --quiet`, then `docker compose up --build -d`.
4. Check `docker compose ps`, `docker compose logs migrate`, and `https://fuel.example.org/health/ready`.
5. Provision the first administrator in a one-off migration container. Export `USER_PASSWORD` securely in the shell; `docker compose run --rm -e USER_PASSWORD migrate node server/cli.js user admin@example.org admin "Platform administrator"`. Remove the variable afterward.
6. Sign in, register real operator brands/stations, provision inspectors/analysts, establish the identity-verification procedure, and validate operator applications against real documents. Create corridor rooms through the directory administration workflow.

The database init script creates non-superuser owner/runtime roles on a **new** volume. It does not rotate roles on an existing volume. The migration container has owner credentials; the API container has runtime credentials only. Application filesystem is read-only and the API runs as a non-root user. The database network is internal; only the proxy publishes host ports.

Database TLS is disabled only on the isolated local Compose network. For managed/remote PostgreSQL set `PGSSLMODE=verify-full` and install/mount the provider's trusted CA (or `NODE_EXTRA_CA_CERTS`) rather than setting `rejectUnauthorized=false`. Use the configuration for your own host instead of blindly reusing the Compose internal-network URL.

## Managed-host deployment

- `npm ci --omit=dev`, provision owner/runtime users with no superuser/CREATEDB/CREATEROLE privileges.
- Run migrations as the owner (`MIGRATION_DATABASE_URL`) in a one-off job. Apply `deploy/runtime-grants.sql` with the runtime role if not named `mafuta_app`; arrange equivalent default privileges for future tables.
- Start `node server/index.js` with the **runtime** `DATABASE_URL`. Do not inject `MIGRATION_DATABASE_URL` into the normal API service.
- Put one trusted TLS reverse proxy before the application and set `TRUST_PROXY_HOPS=1`. Set 0 for direct access or the exact trusted hop count for your topology; never trust arbitrary client forwarded headers. If you add a CDN, reassess proxy trust and firewall direct origin access.
- Configure readiness `/health/ready`, liveness `/health/live`, graceful SIGTERM and 15s shutdown allowance. Readiness requires database access and an installed schema.

## Releases and migrations

1. Run CI, review dependency advisories, and create a release backup.
2. Build an immutable image and record its digest and git revision. The development Dockerfile uses supported major tags; pin approved image digests in your release manifest.
3. Run `docker compose run --rm migrate` for every release before replacing API replicas. `docker compose up -d` alone must not be assumed to rerun an already completed migration container.
4. Migrations are ordered, checksum-verified and serialized by a PostgreSQL advisory lock. Never edit an already applied migration; append a new one.
5. Deploy API image, check readiness, and smoke-test citizen report, operator publication, private evidence download, case officer reply and logout.
6. Roll back the **application image** only if schema compatibility is verified. Database rollback uses a rehearsed restore or a reviewed forward-fix migration, not an automatic destructive down migration.

## Backup and restore

Administrator image/video uploads use persistent PostgreSQL/Neon storage. See [Media Management](16_MEDIA_MANAGEMENT.md) for the migration, runtime grants, upload limits and publication/file lifecycle. No Render upload directory or external object-storage credentials are required.

Backups contain account/case/evidence data. Encrypt them, restrict access, keep them off the application host, define retention with the controller and monitor job success. For the Compose service, a logical backup can be created using:

```sh
docker compose exec -T db pg_dump -U postgres -d mafutawatch -Fc > /secure-backups/mafutawatch.dump
```

Use a dedicated backup account/managed service snapshot policy for routine operation. `bytea` evidence is included in PostgreSQL backups. Retain globals/role provisioning separately; `pg_dump` alone does not capture database users/passwords.

Restore to an **isolated** new database:

```sh
pg_restore --exit-on-error --no-owner --dbname="$RESTORE_DATABASE_URL" mafutawatch.dump
```

Reapply owner/runtime grants, verify migration checksums, count cases/evidence, download a sample attachment and run application smoke tests against the isolated restore. Do not restore over live data without a rehearsed cutover. The audit immutability trigger intentionally blocks mass updates/deletes/truncation; use an empty database for restore. Owners can perform legally approved maintenance by explicitly reviewing trigger/privilege changes.

Initial operating objectives should be agreed with the organization (for example RPO ≤24h, RTO ≤4h); those are targets, not demonstrated guarantees. Use WAL archiving/managed point-in-time recovery if required. Schedule and record restore rehearsals.

## Monitoring and maintenance

- Application emits JSON request logs with request ID, method, **path without query**, status and duration. It does not log request bodies, cookies or credentials. Keep reverse-proxy access logs private; apply a log-retention policy. Avoid putting sensitive data in URLs.
- Alert on readiness failures, sustained 5xx, p95 API latency, auth failures/429 spikes, DB connection saturation, storage growth, database backup age and active case SLA breaches.
- Observe metrics in `/api/v1/admin/dashboard`; restrict export and staff access. Counts are actual database records, not capacity estimates.
- Schedule `node server/cli.js maintain` hourly with owner/maintenance credentials. It deletes expired sessions/rate buckets, expires pending observations beyond 48h and removes notifications older than 90 days. In Compose use a host scheduler calling `docker compose run --rm migrate node server/cli.js maintain`.
- The 24h case response target is computed on server reads; an on-call case team must own the queue. This release has no external paging/SMS worker. Configure actual incident alerting through your monitoring platform.
- Establish approved case/report/evidence/account/audit retention and deletion procedures. There is intentionally no unreviewed generic purge of investigation evidence. Database owners can execute reviewed, logged legal-access/erasure procedures; the API is not a substitute for controller policy.

## Email delivery for account verification

MafutaWatch sends transactional email only for the email-address change workflow (a notice to the current address and a single-use confirmation link to the new one). No marketing email is sent. Without configuration the feature is explicitly disabled: `GET /api/v1/me/email/status` reports `{"enabled":false}`, the profile page states that email changes are unavailable, and `POST /me/email/change-request` answers 503 with the same explanation. Nothing is ever sent and no token is created.

Configure one provider through environment variables (never hardcode credentials in the image or repository):

- Common: `EMAIL_PROVIDER=smtp|http`, `EMAIL_FROM="MafutaWatch Uganda <no-reply@fuel.example.org>"` (required whenever a provider is set; the address must accept bounces).
- SMTP: `EMAIL_SMTP_HOST`, optional `EMAIL_SMTP_PORT` (default 587), `EMAIL_SMTP_SECURE=true` for port 465, `EMAIL_SMTP_USER` and `EMAIL_SMTP_PASSWORD` (API key/token is typical). Prefer a provider IP/ reputation with SPF, DKIM and DMARC aligned on the sending domain, and route bounces to a monitored mailbox.
- HTTP relay: `EMAIL_HTTP_URL` (HTTPS only in production) and optional `EMAIL_HTTP_API_KEY` sent as a bearer token. The relay receives `POST {from,to,subject,text}`.

Restart the API after changing `.env`, then verify: `/health/ready` is healthy, `GET /me/email/status` reports the provider, a test address change arrives with a working link, and a second click on the same link is rejected. Alert on 502/503 responses from `/me/email/change-request`, on provider rejections in the application log, and on undeliverable messages in the provider console. Rollback is disabling the provider (`EMAIL_PROVIDER=`), which immediately restores the truthful disabled state.

## Credentials and account recovery

- Never store `.env`, backups, screenshots of one-time tokens or live credentials in git/issues.
- Operator credentials can be revoked in the station workspace. Password changes and CLI reprovisioning revoke all sessions/integration credentials for that account. Admin suspension blocks existing sessions on every request.
- To recover an account, verify ownership through the operator's documented process, set a new `USER_PASSWORD`, use the owner CLI `user <email> <role> <name>`, clear the environment variable and notify the account holder out of band. No fake password-recovery emails are emitted. The only messages the application sends are the real email-change notifications described above, and only when a delivery provider is configured.
- Rotate runtime/owner/bootstrap database passwords using PostgreSQL role password changes and secret updates; restart dependent connections. Changing `.env` alone does not change an existing DB role password.
- Review staff membership, case assignment and operator licenses regularly. Non-administrator role changes and explicit station assignments are audited administrator operations; administrator roles remain owner-CLI operations. Revoke station-specific assignments when staff leave a station, and verify identity/appointment before provisioning an inspector or analyst.

## Launch validation

Before real traffic, validate the actual station register, ministry/source affiliations, staff identities, contact and privacy-controller details, lawful directives and provider contracts. Run CI against the actual PostgreSQL version; exercise the Compose stack, remote TLS, restore, firewall and proxy topology; do staging load and browser/device/accessibility checks. USSD/WhatsApp/SMS/push channels are not implemented delivery channels in this release and must not be advertised as working. No 150,000-session capacity claim has been validated.
