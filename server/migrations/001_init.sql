-- Independent deployable MVP schema. Do NOT apply the older sql/001_schema_ddl.sql:
-- that file is a design reference requiring elevated extensions and hardcoded DB roles.
BEGIN;
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'citizen' CHECK (role IN ('citizen','operator','admin')),
  station_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS stations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  district VARCHAR(100) NOT NULL,
  address VARCHAR(250),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS fk_app_users_station;
ALTER TABLE app_users ADD CONSTRAINT fk_app_users_station FOREIGN KEY (station_id) REFERENCES stations(id);
CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON app_sessions(expires_at);
CREATE TABLE IF NOT EXISTS price_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  station_id BIGINT NOT NULL REFERENCES stations(id),
  reporter_id UUID NOT NULL REFERENCES app_users(id),
  fuel TEXT NOT NULL CHECK (fuel IN ('petrol', 'diesel')),
  price_ugx INTEGER NOT NULL CHECK (price_ugx BETWEEN 1000 AND 30000),
  note VARCHAR(500) NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  reviewed_by UUID REFERENCES app_users(id),
  reviewed_at TIMESTAMPTZ,
  review_note VARCHAR(500),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_pending ON price_reports(submitted_at DESC) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_reports_station ON price_reports(station_id, fuel, submitted_at DESC);
CREATE TABLE IF NOT EXISTS verified_prices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id BIGINT NOT NULL UNIQUE REFERENCES price_reports(id),
  station_id BIGINT NOT NULL REFERENCES stations(id),
  fuel TEXT NOT NULL CHECK (fuel IN ('petrol','diesel')),
  price_ugx INTEGER NOT NULL CHECK (price_ugx BETWEEN 1000 AND 30000),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verified_latest ON verified_prices(station_id, fuel, verified_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS complaints (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES app_users(id),
  station_id BIGINT REFERENCES stations(id),
  category TEXT NOT NULL CHECK(category IN ('incorrect_price','fuel_quality','service','other')),
  description VARCHAR(2000) NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','investigating','resolved','dismissed')),
  reviewed_by UUID REFERENCES app_users(id),
  response_note VARCHAR(1000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status, created_at DESC);
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID REFERENCES app_users(id),
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
COMMIT;
