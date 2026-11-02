# Source and architecture review

Reviewed baseline: `d9f82184f82ae6a6f881aa7bf07c6695057e59c8` (2026-11-02).
Scope: executable frontend, service worker, manifest, complete DDL, documentation entry page, architecture/security/USSD specifications, data fixtures and documented workflows. Line references below refer to that baseline. This is a source review, not a penetration test of a live environment.

## Findings and remediation

| ID | Severity | Evidence at baseline | Impact | Remediation in v3 |
|---|---|---|---|---|
| S01 | Critical | `app/js/app.js:885–973`, `1470–1533` | Public plaintext admin credentials; fixed OTP; permissions only hide tabs; unauthenticated functions publish prices | Server-side sessions, scrypt passwords, per-route RBAC, assigned-station checks, no default accounts |
| S02 | Critical | `app.js:4–36`, `467–477`, `766–778`, `1923–1934` | Browser edits alter trust/roles; repeated self-reports and votes manufacture verification | PostgreSQL authoritative state; unique votes; independently verified citizens only for consensus; no trust-to-role escalation |
| S03 | High | `app.js:259–263`, `395`, `1381–1389`, `1817–1821`, `1905–1918`, `2053–2065`, `2079` | Stored/DOM XSS via reviews, broadcasts, chat, complaints, tracking input | Escaped rendering, text-only content, external handlers, strict script CSP; no inline execution |
| S04 | High | `app.js:829–840`, `1216`, `1429–1468` | Readable local tokens, predictable Math.random secrets, cosmetic revocation | Cryptographic secrets, hashes at rest, one-time display, station scope, expiry and immediate revocation |
| S05 | High | `app.js:1723–1745`, `1985–2015` | Complaints and phone numbers stored in shared-device localStorage; no ownership isolation | Private authenticated ticket access; minimal personal information; no sensitive browser persistence |
| S06 | High | `app.js:2001–2008`, `2110–2116` | Evidence only saves filenames, not contents; false evidence-retention claims; unsafe filenames | Bounded uploads, content-signature validation, authenticated attachment-only downloads, PostgreSQL bytea storage |
| S07 | High | `service-worker.js:66–96` | Cache-all strategy would cache private API responses; message-controlled cache writes; deletes other apps' caches | Shell allowlist, API network-only, scoped cache cleanup, no arbitrary cache messages |
| D01 | Blocker | `sql/001_schema_ddl.sql:172,186,243,467` | `now()` in index predicates violates PostgreSQL immutable-function requirement | Executable versioned migrations with stable indexes |
| D02 | Blocker | DDL `191–209`, `266` | Foreign key references partitioned reports(id) without a unique key | UUID report primary key and valid foreign keys |
| D03 | Blocker | DDL `298` | Materialized view reads nonexistent `verified_prices.updated_at` | Direct indexed current-price reads; no synchronous full-view refresh |
| D04 | Blocker | DDL `418–424` | pg_partman configured on a table that is not partitioned; schema/version assumption for extension | Plain PostgreSQL baseline; no unnecessary extension dependencies |
| D05 | High | DDL `276–280` | Nullable unique constraint permits multiple current prices | Composite primary key `(station_id,fuel)`; separate append history |
| D06 | High | DDL `570–600` | Fixed DB passwords, elevated admin role, incomplete RLS write policies/session context | Separate owner/runtime credentials; least-privilege grants; authorization in API, clearly documented boundary |
| D07 | Medium | DDL `481–518`, `533–543` | Counters miss pending submissions; tier transitions imply authority; every write refreshes full materialized view | Live SQL aggregates; explicit roles independent of reporting reputation; transactional targeted writes |
| F01 | High | `app.js:1028`, `1055–1058`, `1647–1661`, `1836–1862`, `1950–1954` | Fabricated charts/DAU/alerts, random author impersonation, invented government advisories | Real SQL metrics, authored persisted messages, empty states, source-linked advisories; no invented activity |
| F02 | High | `app.js:59–75`, `index.html:831–925` | Conflicting invented regulatory caps presented as law | Caps empty by default; administrator publishes source and validity interval |
| F03 | Medium | `app.js:2314–2448` inside DOMContentLoaded | Admin functions scoped inside init cannot be called by outer event listeners/inline callbacks | Module-based event handling; complete server workflows |
| F04 | Medium | `app.js:1006–1008`, `2340–2342` | String ticket IDs rendered as unquoted JavaScript; dispatch filtered out of SLA list | UUID data attributes; explicit state machine; SLA includes all active states |
| F05 | Medium | `app.js:1999` | Fixed 2025 ticket IDs collide with seed data and concurrent clients | Server-generated UUID and year/reference; idempotent retries |
| F06 | Medium | `app.js:737–750`, `766–778` | Claimed rolling median ignores time; consensus lacks independent identities/window; flags overwritten by verification | 48h accepted-price baseline, 15min independent consensus, flagged reports require review, station row locks |
| F07 | Medium | `app.js:615–638` | Changes generated in ±30 range can never meet >=100 alert condition | Notifications generated by committed price changes |
| F08 | Medium | `app.js:461–465`, `s[fuel]` writes | History pushed after save; station price mutations disappear after reload | Transactional prices/history/notifications/audit in PostgreSQL |
| F09 | Medium | `app.js:517–522` | Straight-line distance sold as road route; diesel vehicles priced as petrol; empty prices divide by zero | Explicit road-distance input, selectable fuel/efficiency, optional OSRM, unavailable-price state |
| F10 | Medium | `app.js:2355–2361`, broadcast handlers | Claims SMS/WhatsApp dispatch without sending anything | Real in-app notifications; external channels documented as pending integrations |
| U01 | Medium | `index.html:5`, `navbar` markup, modal/review markup | Zoom disabled; mobile menu toggle hidden inside hidden menu; unlabeled controls; no accessible modal closure/focus | Zoom enabled; responsive navigation, semantic forms, native dialog and focus management, keyboard controls |
| A01 | High | README vs docs 01/03/04 vs executable sources | Microservice/Kafka/Redis/PostGIS/150k capacity and compliance claims have no implementation or measurements | Deployable modular monolith and honest operating limits; legacy design marked historical |
| A02 | High | repository root | No API, runtime/dependency manifest, CI, deployment, migrations, backups, recovery or tests | Added server, lockfile, deployment, CI, operational runbook and regression tests |
| A03 | Medium | README deliverable list | Referenced price-verification specification was missing from the repository | Added `docs/02_PRICE_VERIFICATION.md` describing the implemented pipeline and its identity/operational boundaries |

## Architecture decision

Use one stateless Node.js service plus PostgreSQL, behind an HTTPS reverse proxy. This addresses the actual workload without deploying the unimplemented Kafka/Kubernetes/Redis design. Transactions serialize station publications and case transitions; sessions/rate limits are database-backed across replicas. Scale from observed latency, database load and query plans; no national-capacity claim is justified by source inspection.

Evidence is deliberately limited to three 5MiB PNG/JPEG/PDF files per case/application and forced-download responses. Move to private object storage with scanning/quarantine before increasing volumes. Audit rows reject UPDATE/DELETE/TRUNCATE and the runtime DB role receives SELECT/INSERT only. Database owners can still alter triggers; this is not cryptographic immutability against a DBA.

## Boundaries requiring operational validation

- Identity verification is manual and audited. Public account creation does not establish an independent human; it never grants operator/official authority. Automated consensus excludes unverified accounts.
- USSD, WhatsApp, SMS, push delivery, externally attested ministry accounts and telco identity verification need contracted providers, verified domains, credentials and end-to-end delivery tests. They are not simulated as successful.
- Jurisdictional/legal claims, price directives, station licenses, approved staff identities and data retention require the actual operating organization to validate source records. Demo fixtures are not evidence of real prices or licensed status.
- There is no load-test evidence for 150,000 simultaneous users. Staging load/restore/accessibility/device tests and a network penetration test remain rollout work.
- Legacy localStorage is untrusted demonstration data and is not silently migrated. Import real source records through the authenticated directory workflow or an independently reviewed migration.
