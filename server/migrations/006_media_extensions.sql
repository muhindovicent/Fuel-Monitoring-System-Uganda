-- Junction: news_article_photos (many-to-many news_articles <-> media_gallery)
CREATE TABLE IF NOT EXISTS news_article_photos (
  id uuid PRIMARY KEY,
  news_article_id uuid NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
  media_gallery_id uuid NOT NULL REFERENCES media_gallery(id) ON DELETE CASCADE,
  caption text CHECK (length(caption) BETWEEN 2 AND 300),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(news_article_id, media_gallery_id)
);

-- Junction: news_article_videos (many-to-many news_articles <-> video_content)
CREATE TABLE IF NOT EXISTS news_article_videos (
  id uuid PRIMARY KEY,
  news_article_id uuid NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
  video_content_id uuid NOT NULL REFERENCES video_content(id) ON DELETE CASCADE,
  caption text CHECK (length(caption) BETWEEN 2 AND 300),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(news_article_id, video_content_id)
);

-- Grants for the runtime role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mafuta_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON news_article_photos TO mafuta_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON news_article_videos TO mafuta_app;
  END IF;
END $$;