-- MVP schema intentionally independent of the legacy exploratory sql/001_schema_ddl.sql.
-- No fake government price caps, auto-verification, or partitioned-table FK.
CREATE TABLE IF NOT EXISTS app_users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'inspector', 'analyst', 'operator')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  district TEXT NOT NULL CHECK (length(trim(district)) BETWEEN 2 AND 100),
  latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stations_district ON stations(district);
CREATE TABLE IF NOT EXISTS price_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  station_id INTEGER NOT NULL REFERENCES stations(id),
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('petrol', 'diesel')),
  reported_price INTEGER NOT NULL CHECK (reported_price BETWEEN 500 AND 50000),
  reported_location TEXT CHECK (length(reported_location) <= 200),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  review_reason TEXT,
  reviewed_by BIGINT REFERENCES app_users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_reports_moderation ON price_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_reports_station ON price_reports(station_id, fuel_type, created_at DESC);
CREATE TABLE IF NOT EXISTS verified_prices (
  station_id INTEGER NOT NULL REFERENCES stations(id),
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('petrol', 'diesel')),
  price INTEGER NOT NULL CHECK (price BETWEEN 500 AND 50000),
  source_report_id BIGINT NOT NULL REFERENCES price_reports(id),
  verified_by BIGINT NOT NULL REFERENCES app_users(id),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id, fuel_type)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id BIGINT NOT NULL REFERENCES app_users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_time ON audit_events(created_at DESC);
