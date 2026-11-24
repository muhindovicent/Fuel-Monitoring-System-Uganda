CREATE TABLE IF NOT EXISTS email_change_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email text NOT NULL CHECK (new_email = lower(new_email)),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_change_tokens_user ON email_change_tokens(user_id);
CREATE INDEX email_change_tokens_token ON email_change_tokens(token_hash);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mafuta_app') THEN
    GRANT SELECT, INSERT, UPDATE ON email_change_tokens TO mafuta_app;
  END IF;
END $$;
