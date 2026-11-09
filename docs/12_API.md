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
| GET | `/me/email/status` | `{enabled,provider}`; whether this deployment can send verification email |
| POST | `/me/email/change-request` | `{newEmail,currentPassword}`; 202 `{accepted,message}` with no token; sends approval + confirmation links; 503 when no delivery provider is configured |
| POST | `/me/email/confirm` | `{token}`; single use within 24 hours; 200 `{complete:false,approved}` while a second approval is outstanding; 204 changes the address and revokes all sessions |
| GET | `/stations` | Public `q,fuel,sort=name|price,district,lat,lng,radius(km),limit,offset` |
| GET | `/stations/:id` | Public station, current prices, history and reviews; review authors honor profile privacy |
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
| GET | `/rooms`, `/rooms/:id/messages` | Public corridor register/latest 50 messages; authors honor profile privacy and carry no user identifiers |
| POST | `/rooms/:id/messages` | Authenticated `{body}`; author from session |
| PUT | `/messages/:id/vote` | Authenticated, unique account vote, no self-vote |
| DELETE | `/messages/:id` | Inspector/admin hides abusive content and audits decision |
| GET, POST | `/advisories` | Public read (author is MafutaWatch Uganda)/admin create `{title,body,sourceUrl}` |
| GET, POST | `/town-halls` | Public read/admin create `{title,host,startsAt}` |
| POST | `/town-halls/:id/questions` | Authenticated `{body}`, before session starts |
| PATCH | `/questions/:id` | Admin `{answer}` |
| GET | `/media`, `/videos`, `/news` | Public published gallery, videos and news; news respects publication date and reports author MafutaWatch Uganda |
| POST | `/media`, `/videos`, `/news` | Admin metadata create; existing paths retained; see [Media Management](16_MEDIA_MANAGEMENT.md) |
| PATCH, DELETE | `/media/:id`, `/videos/:id`, `/news/:id` | Admin edit/status changes or delete; unused uploads are cleaned up |
| GET | `/admin/media` | Admin published, draft and archived metadata plus upload limits/storage information |
| POST | `/admin/media-assets` | Admin raw JPEG/PNG/WebP (10 MiB) or MP4/WebM (25 MiB); returns `{id,url,mediaType,size}` after database persistence |
| DELETE | `/admin/media-assets/:id` | Admin remove an unreferenced file; 409 when content still uses it |
| GET | `/media-assets/:id` | Public only when referenced by published content; admin private preview; no-store, byte ranges supported |
| GET | `/admin/dashboard`, `/admin/audit` | Inspector/analyst/admin aggregates/audit |
| GET | `/admin/reports` | Inspector/admin pending/flagged observations |
| PATCH | `/admin/reports/:id` | Inspector/admin `{status:verified|rejected,reason}` |
| GET | `/admin/officers` | Inspector/admin active assignees |
| GET, PATCH | `/admin/users`, `/admin/users/:id` | Admin non-admin identity/suspension/role; `{identityVerified?,disabled?,role?,reason}`; role is citizen/operator/inspector/analyst |
| POST | `/admin/staff` | Admin re-authenticated inspector/analyst provisioning; `{email,displayName,password,role,administratorPassword,identityVerified,reason}`; create-only, audited, no email sent |
| GET | `/admin/operator-accounts` | Admin active operator accounts available for explicit station assignment |
| POST | `/admin/operators` | Admin `{name,shortName}` |
| POST | `/admin/rooms` | Admin `{name}`; create a real corridor room |
| GET | `/admin/stations`, `/admin/assignments` | Admin full directory including inactive stations / current staff assignments |
| POST | `/admin/stations/:id/staff` | Admin explicit `{userId,reason}` assignment for an active operator and active station; audited and notified |
| DELETE | `/admin/stations/:id/staff/:userId` | Admin revokes assignment and its integration credentials |
| POST, PATCH | `/admin/stations`, `/admin/stations/:id` | Admin create station / `{active,reason}` |
| PUT | `/admin/caps` | Admin `{district,fuel,price,sourceUrl,effectiveFrom,effectiveUntil}` |
| POST | `/trip` | Public protected write-style request `{distanceKm,kmPerLitre,fuel,from?,to?}`; nullable cost if fresh prices missing |

Pagination defaults to 50, max 100. Entity IDs are UUIDs except integer station/operator/room IDs. Prices are integer UGX/L, 100–100000; bounds are input sanity limits, **not regulatory caps**. Dates use ISO 8601. Coordinates are decimal degrees, and GPS context is not trusted as proof of presence. Health endpoints `/health/live` and `/health/ready` are outside the API prefix.

## Public author visibility

Station reviews and community messages expose only `display_name`, resolved at read time from `user_preferences.privacy.publicDisplayName`: the privacy-preserving default (no stored preference, or `false`) renders `Anonymous Member`, and an explicit `true` renders the member's display name for existing and new content alike. Public message rows carry no `user_id`. Advisories and published news never expose an authoring account: both report `author: "MafutaWatch Uganda"` and news omits `created_by`. Preferences are read and written only through `GET`/`PATCH /me/preferences` for the signed-in account, so one member's choice can never publish another member. Complaint cases, evidence, operator applications, staff directories and audit records keep their authenticated attribution unchanged.

## Email change verification

Changing the sign-in address is a dual-approval, single-use flow and requires an active session plus the current password for password-based accounts:

1. `POST /me/email/change-request` validates the address, the current password and the per-user rate limit (3 per hour), stores only SHA-256 hashes of two random tokens (one per mailbox; every account in this release is password-based, so both are always issued), then sends an approval link to the **current** address and a confirmation link to the **new** one. Tokens are never returned in the response or logged. When no delivery provider is configured the endpoint answers 503 with an explanation instead of pretending to send.
2. Each link opens `/#email-verify?token=…` in the frontend, which calls `POST /me/email/confirm` after the account signs in. The first approval answers 200 `{complete:false,approved}` and changes nothing: the address, sessions and audit trail stay untouched, and re-opening the same link repeats that pending answer. The second approval answers 204.
3. Confirmation runs in a single PostgreSQL transaction that locks the account row, re-reads the token by hash (bound to the requesting account), rejects expired/foreign/duplicate-registered tokens, claims the token with `used_at IS NULL`, and only when every outstanding approval is consumed updates `users.email`, deletes the tokens, deletes all sessions, revokes integration credentials and appends the audit record. Any failure rolls the whole transaction back — a failed confirmation leaves the token unused and the account exactly as it was. The account row lock serialises concurrent confirmations, so a race can never apply half of a change.

Until both approvals the original address keeps working. Rate limits: 3 change requests and 10 confirmations per account per hour.

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
