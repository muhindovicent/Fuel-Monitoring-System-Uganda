# Security and architecture audit — MafutaWatch (initial foundation pass)

Date: 2026-11-02. Scope: source review of `app/js/app.js`, `app/js/data.js`, `app/index.html`, `app/service-worker.js`, `sql/001_schema_ddl.sql`, root README and documentation. This is **not** a completed penetration test or a claim of deployment readiness.

## Confirmed findings and disposition

| ID | Severity | Evidence | Status |
|---|---|---|---|
| SEC-01 | Critical | `app/js/app.js` embedded `ADMIN_ACCOUNTS` with passwords (`admin123`, etc.) | Removed on this branch. JWT login via server replaces demo login. |
| SEC-02 | Critical | `app/js/app.js` operator OTP accepted the fixed code `123456` | Removed. Operator login disabled until verified OTP/onboarding is implemented. |
| SEC-03 | Critical | Browser-controlled `DB.trustScore >= 50` could publish a report automatically | Live reports now submitted to server pending queue; admin/inspector moderation transaction is sole publication path. Demo-only simulation remains explicitly labeled. |
| SEC-04 | High | Browser `localStorage` used as the store for reports, complaints, metrics and authentication state | Live price-report path moved to PostgreSQL. Other demo workflows remain local-only; cannot be represented as production data. |
| SEC-05 | High | JS-generated API tokens use `Math.random`, and seed tokens were embedded in source | Removed browser token generation and example token values. No production API-token feature enabled. |
| SEC-06 | High | Dynamic `innerHTML` templates include report/review/community content | Escaped one direct review-text sink; other sinks require contextual encoding, security tests and refactoring. **Not fully remediated.** |
| SEC-07 | High | Application asserts district legal fuel-price caps not supported by authoritative citations | Disabled price-cap breach generation; existing visual examples relabeled illustrative. Full institutional/claims cleanup outstanding. |
| SEC-08 | High | Repository describes government commissioning/official communications with no independent proof | Added visible independent-prototype banner; public content and partnership approval must be reviewed before launch. |
| DB-01 | High | `sql/001_schema_ddl.sql` uses FK to `price_reports(id)` while `price_reports` is range-partitioned by `created_at`, without a unique key containing partition key | Legacy DDL blocked from automatic execution; new unpartitioned MVP schema with valid FK created. |
| DB-02 | Medium | Legacy DDL requires `pg_partman`, `postgis_topology`, and privileged `CREATE ROLE` grants | Isolated optional advanced design; MVP runs on standard PostgreSQL. |
| OPS-01 | High | No running backend, deployment pipeline or integration tests in original repository | Added backend source, migration scripts, basic source tests, CI build; live verification and production infrastructure still outstanding. |
| UX-01 | Medium | UI blocks pinch-to-zoom via `user-scalable=no` | Removed restrictive viewport setting. |

## Additional incomplete functionality / review needs
- Legacy simulated fraud queue, KYC applications, station ownership, chat, reviews, C2G tracking, broadcast, notifications and audit entries do not have centralized authoritative persistence or trusted identities. Disable or separately label for real-world release.
- Client-side labels of metrics and prices must not imply actual adoption, legal authority or verified source.
- Browser rendering still needs a comprehensive XSS/DOM sink audit and CSP redesign; legacy inline event handlers currently prevent a strict CSP.
- There is no real SMS provider integration, USSD integration, station registration evidence or government-owned pricing feed.
- No end-to-end browser test, privacy impact assessment, independent security assessment, load test, disaster recovery exercise, backups verification or regulator acceptance test has been performed.
- Existing data in seeded `data.js` must never be silently imported as verified production data.

## Recommended release gates
1. Install dependencies and confirm `npm run build && npm test` in CI, then run database migrations on an isolated PostgreSQL instance.
2. Validate login, brute-force protection, server-side role authorization, duplicate moderation conflict, rejected reports, out-of-range inputs and SQL injection protection.
3. Complete C2G data model and consent policies. Implement documented evidence upload via private storage and malware scanning.
4. Validate actual Uganda legal framework; remove government commissioning assertions unless documented written authorization exists.
5. Establish domain/TLS, centralized logs (PII redaction), alerting, backups with restore drills, and a deploy rollback.
6. Perform a security and accessibility review before switching the frontend to a public production mode.

## Manual inspection outcome
This is a source-level initial audit of principal entry points, sensitive routines and schema; not an exhaustive line-by-line assessment of the 2,548-line legacy frontend nor a runtime assurance. All open items above remain blockers for production.

### SW-01 — High (addressed in branch)
The legacy service worker cached all same-origin successful GET requests, which could include authenticated admin API responses. It also accepted unrestricted `CACHE_UPDATED` messages for arbitrary cache writes. The new worker applies network-only handling for `/api/v1/*`, provides a 503 offline response instead of stale data, and removes the cache-update message injection path. Note that third-party hosted APIs must retain the `/api/v1` path convention or the worker should be extended to compare the configured API origin before deploying.
