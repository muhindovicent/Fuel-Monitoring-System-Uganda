-- Additive: existing gallery/video records retain their published visibility.
ALTER TABLE media_gallery ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft','archived'));
ALTER TABLE media_gallery ADD COLUMN IF NOT EXISTS caption text CHECK (length(caption) <= 300);
ALTER TABLE media_gallery ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE video_content ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft','archived'));
ALTER TABLE video_content ADD COLUMN IF NOT EXISTS source text CHECK (length(source) BETWEEN 2 AND 200);
ALTER TABLE video_content ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE video_content ADD COLUMN IF NOT EXISTS license text;
ALTER TABLE video_content ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Durable binary objects live in PostgreSQL/Neon, never on an application disk.
-- Files remain private until a published content record references their URL.
CREATE TABLE media_assets (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL REFERENCES users(id),
  media_type text NOT NULL CHECK (media_type IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
  size integer NOT NULL CHECK (size BETWEEN 1 AND 26214400),
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(data) = size),
  CHECK (media_type NOT LIKE 'image/%' OR size <= 10485760)
);
CREATE INDEX media_gallery_public ON media_gallery(status, created_at DESC);
CREATE INDEX video_content_public ON video_content(status, created_at DESC);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mafuta_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON media_assets TO mafuta_app;
  END IF;
END $$;
