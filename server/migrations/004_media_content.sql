CREATE TABLE IF NOT EXISTS news_articles (
  id uuid PRIMARY KEY,
  title text NOT NULL CHECK (length(title) BETWEEN 5 AND 200),
  summary text NOT NULL CHECK (length(summary) BETWEEN 10 AND 500),
  body text NOT NULL CHECK (length(body) BETWEEN 10 AND 10000),
  source_url text NOT NULL,
  source_name text NOT NULL CHECK (length(source_name) BETWEEN 2 AND 100),
  category text NOT NULL CHECK (category IN ('fuel-prices','petroleum-markets','energy-policy','transport','infrastructure')),
  image_url text,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft','archived')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX news_articles_category ON news_articles(category, created_at DESC);
CREATE INDEX news_articles_status ON news_articles(status, created_at DESC);

CREATE TABLE IF NOT EXISTS media_gallery (
  id uuid PRIMARY KEY,
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 200),
  description text NOT NULL CHECK (length(description) BETWEEN 5 AND 1000),
  category text NOT NULL CHECK (category IN ('fuel-stations','transport','energy-infrastructure','public-events')),
  image_url text NOT NULL,
  thumbnail_url text,
  photographer text NOT NULL CHECK (length(photographer) BETWEEN 2 AND 100),
  source text NOT NULL CHECK (length(source) BETWEEN 2 AND 200),
  license text NOT NULL CHECK (license IN ('CC BY 4.0','CC BY-SA 4.0','CC BY-ND 4.0','CC0 1.0','All Rights Reserved')),
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_gallery_category ON media_gallery(category, created_at DESC);

CREATE TABLE IF NOT EXISTS video_content (
  id uuid PRIMARY KEY,
  title text NOT NULL CHECK (length(title) BETWEEN 5 AND 200),
  description text NOT NULL CHECK (length(description) BETWEEN 10 AND 1000),
  category text NOT NULL CHECK (category IN ('platform-howto','fuel-saving','road-safety','boda-experiences','price-verification','energy-events')),
  video_url text NOT NULL,
  thumbnail_url text,
  duration text NOT NULL CHECK (length(duration) BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX video_content_category ON video_content(category, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mafuta_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON news_articles TO mafuta_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON media_gallery TO mafuta_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON video_content TO mafuta_app;
  END IF;
END $$;
