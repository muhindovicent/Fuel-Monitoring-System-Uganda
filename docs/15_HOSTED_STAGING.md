# Hosted staging deployment

## Targets and architecture

- Frontend: https://mafuta-watch-staging.vercel.app — Vercel project `mafuta-watch-staging`, root `app`, Node 24 static build.
- API: https://mafuta-watch-api.onrender.com — existing Render service `srv-dbkeoa56e07s73cucbpg`, repository-root Dockerfile, Node 24 / Express 5.
- Source branch: `ui/map-first-command-center`. Deployment does not merge or modify `main`.
- `app/build.mjs` copies an explicit public asset allowlist and pinned Leaflet files/license into `app/dist`. The build excludes root environment, server, database, deployment and test files.
- `app/vercel.json` proxies `/api/*` and `/health/*` to Render. Browsers use same-origin cookies; no public API keys or frontend environment secrets are required.

## Database transition

Read-only inspection found that the old NestJS application uses incompatible `app_users`, `stations` and `schema_migrations` structures. Its single active bootstrap administrator was the only account; stations, reports, verified prices and audit events were empty.

The deployment creates database `mafutawatch_v3` and login role `mafuta_v3_app` on the same approved Neon endpoint. The legacy database is retained. A matching ownership comment is required before reusing managed resources; unrelated existing databases/roles are refused.

The existing checksummed SQL migrations run with the owner connection. Runtime credentials grant application DML without schema creation, role/database administration, audit mutation or migration mutation. They are stored directly in Render, never exported as an artifact or printed. Strict PostgreSQL TLS verification is used for provisioning and runtime.

The bootstrap administrator is provisioned with the existing Actions email/password using the current application's scrypt format. Repeated runs preserve its ID/hash and refuse a mismatch instead of resetting existing credentials. No demonstration directory or operational records are seeded.

If inspection finds additional legacy accounts/business records, the automatic transition stops for an explicit record migration.

## Deployment and verification

`.github/workflows/mafuta-staging-deploy.yml` runs for application, dependency, deployment, CI or hosting-test changes on the feature branch. Required Actions secrets:

- `RENDER_API_KEY`
- `NEON_DIRECT_DATABASE_URL`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`

Dependency installation, lint and tests run without these secrets. Deployment also waits for the same commit's complete application CI, including PostgreSQL 17, browser, frontend build and Docker/Compose verification. Only the deployment step receives them. That step:

1. Verifies the repository/service/database identities and inspects the legacy register read-only.
2. Provisions/migrates the isolated database, verifies runtime privileges and preserves the legacy register.
3. Pins Render to the workflow's commit and repository-root Dockerfile, turns automatic deployment off, sets production origin/TLS/runtime connection and `/health/ready`, then polls deployment status.
4. Checks real public collection shapes, no-store headers, admin login/session continuity, secure cookie flags, protected staff endpoints, rejected Origin/CSRF/header violations, logout revocation, and unchanged legacy record counts.
5. Checks the same session workflow through Vercel once its frontend proxy is published, including actual Chromium UI login, browser acceptance of the secure cookie, the administrator command center and UI logout. Root HTML security headers are also required, so an incomplete header matcher cannot pass.

Render configuration and previous environment values are retained in process memory for automatic restoration if deployment/direct-backend verification fails. Both databases remain available. A rollback failure is reported explicitly; inspect the Render dashboard before retrying.

Publish the frontend using the authenticated Vercel CLI from the repository root:

```sh
vercel link --project mafuta-watch-staging --scope vicent-s-projects1 --yes
vercel project update mafuta-watch-staging --node-version 24.x --root-directory app --framework other --scope vicent-s-projects1 --yes
vercel deploy --prod --scope vicent-s-projects1 --yes
```

Rerun the successful staging workflow after frontend publication to verify Vercel's proxied login/session/logout. An identical live Render commit/environment is reused, while migrations/bootstrap are checked for repeatability.

## Authorized staff provisioning

`.github/workflows/mafuta-staff-provision.yml` creates inspector or analyst accounts without a local terminal and without changing any other account. Before first use, an administrator must configure:

1. Repository variable `STAFF_PROVISIONERS` — comma-separated GitHub logins allowed to request or rerun provisioning. The workflow fails closed when this is unset or the triggering/rerunning actor is not listed.
2. Environment `mafuta-staff-provisioning` with required reviewers (repository administrators). The provision job waits for that approval. The environment is the approval gate; the variable is the actor allowlist.
3. Secrets `STAFF_ACCOUNT_EMAIL`, `STAFF_ACCOUNT_DISPLAY_NAME`, `STAFF_ACCOUNT_PASSWORD` for the one account being created. Keep them private and update/remove them between requests.

Run **Provision authorized MafutaWatch staff** from the Actions tab with a non-secret `request_id` (8–64 characters), the role (`inspector` or `analyst`), and an authorization `reason` (20–500 characters). Alternatively commit `.github/staff-provisioning-request.json` with `enabled: true` and the same fields; keep it disabled otherwise. The workflow:

- accepts only the authorized repository/feature branch and configured administrator actors;
- re-authenticates an active application administrator from private secrets before writing;
- creates only a new account, never elevates an existing email, and refuses any role other than the requested inspector/analyst;
- requires the managed runtime database identity and least-privilege checks;
- is idempotent for the same request/account payload and rejects a request ID reused for a different account;
- appends an append-only audit event with the request ID, reason, administrator ID, GitHub actor, run ID and commit.

No password or database credential is written to logs, artifacts or the repository. Password changes, session/token revocation and normal role enforcement remain in the application. Operator access still uses the existing citizen application and administrator approval flow.

Alternatively, an administrator can create one inspector or analyst account directly from **User management → Staff accounts & access** by entering the account details, a temporary password, the administrator's own password, an explicit identity/appointment confirmation and an authorization reason. This path is create-only, hashes the password, appends an audit event, sends no email and displays no credential afterward; the administrator must deliver the temporary password through an approved secure channel. The protected workflow remains available for GitHub-mediated provisioning.

Existing non-administrator accounts can also be reassigned between citizen, operator, inspector and analyst from **User management**. Each change requires a recorded authorization reason, revokes the account's sessions and API tokens, and removes station assignments when operator access is removed. Station access is granted explicitly from **Station directory** to an active operator account and revoked with its integration credentials. Administrator accounts and roles remain CLI-managed.

## Stakeholder credentials

There are no shared stakeholder logins. Citizens register their own accounts; operator applicants keep that account and receive station access after document approval or explicit administrator assignment; inspector and analyst accounts are created by an authenticated administrator or with the private `STAFF_ACCOUNT_*` secrets through the approved workflow; the administrator uses the bootstrap account. Passwords are stored only as scrypt hashes and cannot be recovered from the database or repository.

## Local verification

- Node 24.22.1; `npm run lint` passes.
- `npm test`: 39 passed, including real SQL checks for bootstrap repeatability, credential preservation, runtime mutation denial, public build exclusions, administrator role assignment, manual staff provisioning with re-authentication, suspension/restore, explicit station assignment/revocation and staff-provisioning authorization/idempotency.
- `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e`: 46 passed, including every role's login/logout, role navigation, administrator role assignment, new-staff provisioning and sign-in, explicit station assignment, denial of cross-role APIs, operator request continuity and 360/1440px layouts.
- `npm run build` in `app`: passes with the locked Leaflet dependency.
- The Docker healthcheck respects Render's `PORT` environment variable.

The final browser run also covers a delayed case-save response without reopening a dismissed dialog. The main citizen photograph loads asynchronously at low priority, avoiding observed desktop native-lazy-loading stalls.

The live register starts empty until approved real station/operator records are entered. Support contacts, official notices and operational prices must come from the actual operating team. Render's existing free compute plan is retained.
