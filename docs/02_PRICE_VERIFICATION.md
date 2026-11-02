# Implemented price verification (v3)

Authoritative code: `server/pricing.js`, moderation routes in `server/api.js`, constraints in `server/migrations/`.

## Inputs and persistence

An authenticated account submits a station ID, supported fuel (`petrol`, `diesel`, `kerosene`), integer UGX/L price (100–100000 sanity bounds), optional note and paired optional GPS coordinates. A UUID `Idempotency-Key` identifies one observation. Repeated delivery returns the existing matching observation; changed payload with the same key returns a conflict. GPS is supporting context, not proof of presence.

Submission obtains a station row lock. The report, any verification outcome, price publication, accepted history, audit and notifications are committed atomically. The current price primary key `(station_id,fuel)` prevents duplicate authoritative rows under concurrent publications.

## Baseline and flags

- Baseline: median of accepted, non-demo price-history observations in the last 48 hours.
- A deviation greater than 25%, or a price above a currently effective source-linked district directive, creates a `flagged` observation.
- Flagging is a request for human review, not an automatic finding of fraud. There is no reward/penalty that promotes users to privileged roles.
- Insufficient baseline does not invent a reference price; normal observations remain pending unless genuine verified-citizen consensus is achieved.

## Independent consensus

Only citizens with **independently verified identities** contribute. Verification is an audited administrator action backed by the operator organization's actual identity procedure; email/password registration is not enough.

Select the most recent pending report per distinct eligible account for the station and fuel within 15 minutes, with prices no more than 2.5% away from the new observation. Reports preceding an existing accepted non-demo publication are excluded, so old votes cannot override a new operator price. Three or more eligible accounts publish the rounded median and mark only those contributing observations verified. All station decisions serialize under the same row lock. Flagged reports, operator accounts, staff, disabled accounts and repeated observations from one person do not count as independent votes.

## Human review and operator updates

An inspector or administrator can verify/reject a pending or flagged report with a recorded reason. Self-review is denied. A report observed before a newer accepted publication cannot replace it; the reviewer should reject stale evidence with an explanation. Reviewed reports cannot be reviewed again.

Assigned, approved operators publish directly through an authorized endpoint. This is explicitly labeled **operator** provenance, distinct from citizen consensus or moderator review. A dashboard update sends the previously observed update timestamp and receives 409 if another writer has changed the price. Credential-based forecourt integrations can intentionally publish a new authoritative update without an expected timestamp. Changes generate committed follower notifications and append history/audit records.

## Expiry and display

Prices older than 48 hours are labeled stale and excluded from fresh operational aggregates/trip averages; demo prices are also excluded. Scheduled maintenance marks undecided pending observations older than 48 hours expired. Flagged cases remain available for human review. Public price data always includes provenance and update time. There are no synthetic trend points, random pump-price changes or browser-local authoritative updates.
