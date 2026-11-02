ALTER TABLE applications ADD COLUMN idempotency_key uuid;
CREATE UNIQUE INDEX applications_retry ON applications(user_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
