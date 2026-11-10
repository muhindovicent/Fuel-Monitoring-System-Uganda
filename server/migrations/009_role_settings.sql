-- Role-specific settings live in the existing per-account preference row.
ALTER TABLE user_preferences ADD COLUMN role_settings jsonb NOT NULL DEFAULT '{}';
