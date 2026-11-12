# Verified new-station onboarding (O3)

Citizens open **Station workspace → Register a New Station** when their station is
absent from the directory. Existing registered-station access applications remain
at `#operator` and continue to use `/applications`.

## Submission and evidence

`POST /api/v1/station-requests` accepts a strict JSON object:

```json
{
  "stationName": "Proposed station",
  "operatorName": "Operator brand",
  "district": "Kumi",
  "area": "Town centre",
  "region": "Eastern",
  "latitude": 1.51,
  "longitude": 34.95,
  "contactName": "Applicant name",
  "contactPhone": "+256700000000",
  "contactEmail": "applicant@example.org",
  "licenseReference": "Operating-licence-reference"
}
```

Use a UUID `Idempotency-Key`. All details must match on retry. A new key with the
same pending station/name/district and identical details returns the saved request;
conflicting details return 409. Separate station proposals can coexist.

Migration `011_new_station_requests.sql` stores proposals separately from `stations`.
Submission creates no brand, station, prices, staff assignment or account authority.
Proposals are `pending`, displayed as **Awaiting documents** without evidence and
**Pending verification** when documents exist. Creation without files is supported
so interrupted uploads remain recoverable, but approval requires licence evidence.

Upload documents to `POST /station-requests/:id/attachments` using the existing raw
evidence headers (`Content-Type`, `X-File-Name`) and session/CSRF protections. Only the
owner can upload while pending. JPEG, PNG and PDF signatures are validated, with
three files maximum and 5 MiB per file. Retrying identical bytes and filename returns
the original file ID, avoiding duplicate evidence after an ambiguous upload response.
The request page also supports uploading later to the saved proposal after refresh.

Contact information and documents are restricted to the applicant and administrators.
Downloads use the existing authorized `/attachments/:id` endpoint with no-store,
forced attachment and sandbox headers. Inspectors, analysts, other citizens and
unauthenticated users cannot read proposal documents. Ordinary complaint evidence
remains optional and its authorization is unchanged.

## Duplicates and verification

The applicant can check for existing stations before submission. A matching normalized
name or coordinates within 0.005 degrees on both axes is a **potential** duplicate,
not a confirmed identity. Public warnings use active directory entries; administrators
also see inactive entries. The UI guides applicants to request existing-station access.
Warnings are recalculated on listing and approval, including proposals approved since
the original submission.

Administrators open **Operations dashboard → New station requests** to inspect site
details, contacts, private licence documents and warnings. A recorded reason of at
least 10 characters is required for either decision. Approval without documents is
refused. If a duplicate exists, create-new approval returns 409: the administrator
must associate an active, non-demo verified station using `stationId`, or resolve
the directory issue before proceeding. An association never edits the existing station
or creates the proposed brand. Inactive/demo candidates cannot receive access through
this association.

## Atomic decision

An approval transaction locks the proposal and serializes station/brand creation.
It checks the current applicant role and account state, then:

1. Associates the specified verified station, or reuses a case-insensitive matching
   brand (creates one if necessary) and creates the approved active, non-demo station.
2. Adds the station assignment, promotes a citizen to operator where needed, and
   deletes every existing applicant session.
3. Records the decision, reviewer, reason, timestamp and final station ID.
4. Stores the applicant notice and append-only audit events, including station/brand
   creation, previous role, session revocation count and association/create outcome.

Any failure rolls all these writes back. Concurrent reviews cannot commit twice.
The applicant must sign in again to reach the existing **Assigned Station Workspace**
and publish prices only for assigned stations. Existing station-scoped integration
credential authorization is reused.

A rejection changes only the request decision and its notification/audit records;
directory records, roles, sessions and assignments are preserved. Decided evidence
stays private and further uploads are closed.

## Regression coverage

`test/station-requests.test.js` exercises validation, privacy, raw uploads/retries,
unpublished proposals, duplicate association and approval rechecks, role gates,
transaction rollback, concurrent approvals, revocation, fresh login and scoped prices.
`test/browser/station-onboarding.spec.js` runs through its own isolated Playwright
project and server on port 3107, covering later evidence, duplicate association,
interrupted upload recovery, rejected edited retries, rejection and approval-to-login
price publication. Full CI also runs native PostgreSQL 17 and runtime-container checks.
