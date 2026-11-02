# API v1

Base: `/api/v1`, same origin as the frontend. JSON except bounded raw attachment uploads/downloads. Errors are `{ "error": "message", "requestId": "..." }`; use the request ID with support logs. Statuses include 400 validation, 401 unauthenticated, 403 unauthorized/CSRF, 404 unavailable or inaccessible, 409 conflicting/stale state, 413 size, 429 rate limit, 5xx unavailable.

Browser writes require `Origin: <APP_ORIGIN>`, `X-Requested-With: MafutaWatch`, and, when signed in, `X-CSRF-Token` from the session response. Use same-origin cookies. CORS is deliberately not enabled. Roles and identities are always derived from the authenticated session, not payload fields. Unknown payload fields are rejected.

## Endpoints

| Method | Path | Access / purpose |
|---|---|---|
| GET | `/auth/session` | Current user and CSRF token, or null |
| POST | `/auth/register` | `{email,password,displayName,consent:true}`; citizen only |
| POST | `/auth/login` | `{email,password}`; sets session cookie, returns CSRF token |
| POST | `/auth/logout` | Authenticated, revokes session |
| POST | `/auth/password` | `{currentPassword,newPassword}`, revokes all sessions/tokens |
| GET | `/stations` | Public `q,fuel,sort=name|price,district,lat,lng,radius(km),limit,offset` |
| GET | `/stations/:id` | Public station, current prices, history and reviews |
| GET | `/operators`, `/summary`, `/caps` | Public directory metadata and live aggregates |
| POST | `/reports` | Authenticated `{stationId,fuel,price,note?,latitude?,longitude?}`; UUID `Idempotency-Key` required |
| GET | `/me/reports` | Own observations, paginated |
| PUT | `/stations/:id/prices` | Assigned operator/admin or scoped API credential; `{fuel,price,expectedUpdatedAt?}` |
| GET | `/operator/stations`, `/operator/reports` | Operator/admin assigned data |
| POST | `/stations/:id/reviews` | Authenticated `{rating:1..5,body}`; one editable review per user/station |
| GET | `/me/subscriptions` | Own followed stations |
| PUT | `/stations/:id/subscription` | `{enabled:true|false}` |
| GET | `/me/notifications` | Latest own 100 in-app notifications |
| POST | `/me/notifications/read` | `{ids:[UUID...]}`; modifies own records only |
| POST | `/tickets` | `{stationId,category,vehicleType,incidentDate,description}`; UUID `Idempotency-Key` required |
| GET | `/tickets` | Own cases; inspector/admin case queue; `status,limit,offset` |
| GET | `/tickets/:id` | Owner/inspector/admin; includes private messages and evidence metadata |
| POST | `/tickets/:id/messages` | Owner/inspector/admin `{body}`; no replies to closed/resolved cases |
| PATCH | `/tickets/:id` | Inspector/admin `{status,assignedTo?,reason,version}`; validated transitions |
| POST | `/applications` | Authenticated `{stationId,licenseReference}`; UUID `Idempotency-Key` required |
| GET | `/applications` | Own applications or administrator review queue |
| PATCH | `/applications/:id` | Admin `{status:approved|rejected,reason}`; evidence required to approve |
| POST | `/tickets/:id/attachments`, `/applications/:id/attachments` | Owner; raw JPEG/PNG/PDF body, `X-File-Name`; max 5MiB and 3 files per parent |
| GET | `/attachments/:id` | Parent access authorization, forced download, no cache |
| GET, POST | `/tokens` | Own metadata / generate `{stationId,name}`; operator/admin explicitly assigned |
| DELETE | `/tokens/:id` | Own credential immediate revocation |
| GET | `/rooms`, `/rooms/:id/messages` | Public corridor register/latest 50 messages |
| POST | `/rooms/:id/messages` | Authenticated `{body}`; author from session |
| PUT | `/messages/:id/vote` | Authenticated, unique account vote, no self-vote |
| DELETE | `/messages/:id` | Inspector/admin hides abusive content and audits decision |
| GET, POST | `/advisories` | Public read/admin create `{title,body,sourceUrl}` |
| GET, POST | `/town-halls` | Public read/admin create `{title,host,startsAt}` |
| POST | `/town-halls/:id/questions` | Authenticated `{body}`, before session starts |
| PATCH | `/questions/:id` | Admin `{answer}` |
| GET | `/admin/dashboard`, `/admin/audit` | Inspector/analyst/admin aggregates/audit |
| GET | `/admin/reports` | Inspector/admin pending/flagged observations |
| PATCH | `/admin/reports/:id` | Inspector/admin `{status:verified|rejected,reason}` |
| GET | `/admin/officers` | Inspector/admin active assignees |
| GET, PATCH | `/admin/users`, `/admin/users/:id` | Admin non-admin identity/suspension; `{identityVerified?,disabled?,reason}` |
| POST | `/admin/operators` | Admin `{name,shortName}` |
| POST | `/admin/rooms` | Admin `{name}`; create a real corridor room |
| GET | `/admin/stations`, `/admin/assignments` | Admin full directory including inactive stations / current staff assignments |
| DELETE | `/admin/stations/:id/staff/:userId` | Admin revokes assignment and its integration credentials |
| POST, PATCH | `/admin/stations`, `/admin/stations/:id` | Admin create station / `{active,reason}` |
| PUT | `/admin/caps` | Admin `{district,fuel,price,sourceUrl,effectiveFrom,effectiveUntil}` |
| POST | `/trip` | Public protected write-style request `{distanceKm,kmPerLitre,fuel,from?,to?}`; nullable cost if fresh prices missing |

Pagination defaults to 50, max 100. Entity IDs are UUIDs except integer station/operator/room IDs. Prices are integer UGX/L, 100–100000; bounds are input sanity limits, **not regulatory caps**. Dates use ISO 8601. Coordinates are decimal degrees, and GPS context is not trusted as proof of presence. Health endpoints `/health/live` and `/health/ready` are outside the API prefix.

## Operator integration example

Create a station-specific credential in the signed-in station workspace. Store it securely; the plaintext is returned only once. The integration sends:

```http
PUT /api/v1/stations/42/prices
Authorization: Bearer mfw_<64-hex-secret>
Content-Type: application/json

{"fuel":"diesel","price":5400}
```

Only this endpoint is allowed with a credential; it cannot read private records, create staff, or publish for another station. Revoking the credential, disabling the account, removing its station assignment or expiry invalidates it. `expectedUpdatedAt` may be supplied to avoid overwriting a concurrently changed price; use the exact timestamp observed by the dashboard. Publishing the same value records a new accepted observation/history; do not hammer updates when the pump price is unchanged.

## Report/case retries

Generate a UUID per logical submission and send it in `Idempotency-Key`. Reuse it after an ambiguous network timeout; do not change core submission data while retrying the same key. A committed duplicate returns the existing record, and a mismatched key/data returns 409. Attach evidence only after a parent ID is confirmed. If an attachment upload times out, inspect current attachments before retrying, as uploads are not idempotent and the three-file quota is enforced transactionally.
