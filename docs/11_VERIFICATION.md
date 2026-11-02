# Verification record

Executed locally on 2026-11-02 in Windows, Node.js **24.22.1**, npm **12.2.0**. Native PostgreSQL was installed outside PATH; an **isolated temporary PostgreSQL 18.6 cluster on loopback port 55432** was used. The existing system PostgreSQL service/databases were not used or modified. The temporary server was stopped after verification.

## Results

| Check | Result |
|---|---|
| `npm run lint` | Passed, no lint errors |
| `npm test` with PGlite | **19 tests passed**, no failures (18 workflow checks plus the parent test) |
| Same `npm test` with native PostgreSQL 18.6 | **19 tests passed**, no failures |
| `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e` | **4 real-browser workflows passed**, desktop and mobile viewport |
| `npm audit --audit-level=moderate` | **0 known vulnerabilities** in the installed locked dependency tree |
| `git diff --check` | Passed; Git reported only existing CRLF normalization notices |
| `bash -n deploy/init-db.sh` | Passed |
| Actual `deploy/init-db.sh` on a fresh temporary database | Passed; separate non-superuser owner/runtime roles provisioned |
| Owner CLI `db:migrate` / `db:user`, then `node test/runtime-smoke.js` | Passed with production configuration, runtime database login and restricted privileges |
| Native `pg_dump -Fc` → empty database `pg_restore --exit-on-error --no-owner` | Passed; matching reports/evidence/audit counts and evidence byte lengths |
| Desktop/mobile screenshot inspection | Completed; corrected hero/sidebar contrast and card spacing |

Browser checks used the installed Edge Chromium channel because the downloadable test-browser transfer was too slow. CI uses Playwright's downloaded Chromium instead.

## Regression coverage

- Repeatable checksummed migrations and HTTPS production-origin validation.
- Citizen registration cannot assign roles; sessions/CSRF/origin/role gates and no-store headers.
- Repeated unverified-user reports do not create independent consensus; report and application idempotency.
- Verified-citizen consensus, concurrent station publication, old-vote exclusion after newer publications, manual verification, self-review denial, stale-price conflict detection and flagged outlier review.
- Assigned-operator checks; precise PostgreSQL timestamp concurrency checks; committed follower notifications; hashed/scoped API tokens and revocation.
- Private case ownership, evidence persistence and download authorization, MIME-signature rejection and attachment quotas.
- Case state transitions, version conflicts, active staff assignment, citizen replies, server-generated first response and overdue state.
- Evidence-backed manual operator approval, station assignment revocation, directory deactivation/reactivation, role-restricted corridor creation.
- Community author attribution, unique votes, no self-vote and moderation.
- Administrator-only advisories and effective source-linked district directives.
- Append-only audit triggers, runtime-role denial of audit/migration mutation and transaction rollback.
- Bounded queries, parameterized injection input, radius search, fuel-specific trip estimates, actual metrics, password/session revocation and logout.

Browser journeys cover citizen report submission and reload persistence, private complaint/reply, escaped XSS-shaped content, operator publication, inspector dashboard/review queue, mobile station navigation, dialog Escape behavior, shell-only service worker caching and visible offline failure, administrator directory/corridor creation and sourced-advisory publication. Screenshot artifacts are in ignored `test-results/`.

Native testing caught a real discrepancy not exposed by the embedded engine: PostgreSQL DATE values parsed as local-midnight JavaScript Dates could shift an incident date during idempotent retries. Calendar dates now remain strings in the pg driver. Current-price concurrency and stale-report checks also compare timestamps inside PostgreSQL to retain microsecond precision.

## Backup/restore evidence

The test database and its independent restored copy both contained:

| Reports | Attachments | Total evidence bytes | Audit entries |
|---:|---:|---:|---:|
| 16 | 4 | 96 | 53 |

These were synthetic regression fixtures, not real records. This validates the logical mechanism, not a large-dataset recovery time or a deployed backup schedule.

## Explicitly not verified locally

- Docker image build, Compose orchestration and Caddy TLS execution: Docker is not installed on this machine. The CI workflow includes image build and an HTTPS Compose/runtime-role smoke test, but that workflow has **not** been run remotely in this session.
- PostgreSQL 17: configured in CI; local native checks used 18.6 and the embedded engine.
- Live domain/DNS/TLS, managed database CA, hosting/firewall configuration, real credentials, approved station/identity records or ministry directives.
- External OSRM availability, SMS/USSD/WhatsApp/push delivery, third-party identity verification and malware-scanning services.
- National-capacity/load claims, penetration testing, cross-browser/Safari testing, formal WCAG audit, legal compliance certification or production RPO/RTO.

Use [10_OPERATIONS.md](10_OPERATIONS.md) for rollout and operating procedures and [08_REVIEW.md](08_REVIEW.md) for the baseline findings.
