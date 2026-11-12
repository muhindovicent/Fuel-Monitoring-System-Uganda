-- New station registration requests for stations not yet listed in the directory.
-- Proposed stations stay pending verification and are never published or activated
-- until an administrator approves the request.
CREATE TABLE station_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  station_name text NOT NULL CHECK (length(station_name) BETWEEN 2 AND 200),
  operator_name text NOT NULL CHECK (length(operator_name) BETWEEN 2 AND 150),
  district text NOT NULL CHECK (length(district) BETWEEN 2 AND 100),
  area text NOT NULL CHECK (length(area) BETWEEN 2 AND 100),
  region text NOT NULL CHECK (region IN ('Central','Eastern','Northern','Western')),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -1.6 AND 4.3),
  longitude double precision NOT NULL CHECK (longitude BETWEEN 29.5 AND 35.1),
  contact_name text NOT NULL CHECK (length(contact_name) BETWEEN 2 AND 80),
  contact_phone text NOT NULL CHECK (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  contact_email text NOT NULL CHECK (contact_email = lower(contact_email)),
  license_reference text NOT NULL CHECK (length(license_reference) BETWEEN 3 AND 200),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decision_reason text,
  reviewed_by uuid REFERENCES users(id),
  station_id integer REFERENCES stations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  idempotency_key uuid NOT NULL
);
CREATE UNIQUE INDEX station_requests_retry ON station_requests(user_id,idempotency_key);
CREATE UNIQUE INDEX station_requests_pending ON station_requests(user_id,lower(station_name),lower(district)) WHERE status='pending';

CREATE INDEX station_requests_user ON station_requests(user_id);
CREATE INDEX station_requests_status ON station_requests(status) WHERE status='pending';
CREATE INDEX station_requests_location ON station_requests(latitude, longitude);

-- Allow private evidence attachments on station requests, alongside tickets and applications.
ALTER TABLE attachments ADD COLUMN station_request_id uuid REFERENCES station_requests(id);
ALTER TABLE attachments DROP CONSTRAINT attachments_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_check CHECK (
  (CASE WHEN ticket_id IS NULL THEN 0 ELSE 1 END +
   CASE WHEN application_id IS NULL THEN 0 ELSE 1 END +
   CASE WHEN station_request_id IS NULL THEN 0 ELSE 1 END) = 1
);
CREATE INDEX attachments_station_request ON attachments(station_request_id);

-- Existing deployments may already have a runtime role; managed deployments also
-- reapply deploy/runtime-grants.sql after migrations.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mafuta_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON station_requests TO mafuta_app;
  END IF;
END; $$;
