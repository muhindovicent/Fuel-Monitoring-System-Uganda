ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_name text CHECK (length(preferred_name) BETWEEN 2 AND 80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text CHECK (phone ~ '^\+?[0-9]{7,15}$');
ALTER TABLE users ADD COLUMN IF NOT EXISTS district text CHECK (length(district) BETWEEN 2 AND 100);

CREATE TABLE IF NOT EXISTS user_avatars (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image/jpeg','image/png','image/webp')),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 2097152),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  fuel_type text CHECK (fuel_type IN ('petrol','diesel','kerosene')),
  vehicle_type text CHECK (vehicle_type IN ('private','boda','taxi','truck','other')),
  preferred_district text CHECK (length(preferred_district) BETWEEN 2 AND 100),
  notifications jsonb NOT NULL DEFAULT '{}',
  privacy jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deletion_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(reason) BETWEEN 5 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mafuta_app') THEN
    GRANT SELECT, INSERT, UPDATE ON user_avatars TO mafuta_app;
    GRANT SELECT, INSERT, UPDATE ON user_preferences TO mafuta_app;
    GRANT SELECT, INSERT ON deletion_requests TO mafuta_app;
  END IF;
END $$;
