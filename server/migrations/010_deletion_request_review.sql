-- Accountable review lifecycle: pending -> info_requested -> pending -> approved | rejected.
ALTER TABLE deletion_requests DROP CONSTRAINT deletion_requests_status_check;
ALTER TABLE deletion_requests ADD CONSTRAINT deletion_requests_status_check CHECK (status IN ('pending','info_requested','approved','rejected'));
ALTER TABLE deletion_requests ADD COLUMN review_note text;
ALTER TABLE deletion_requests ADD COLUMN user_response text;
-- One active request per account; decided requests remain as history.
CREATE UNIQUE INDEX deletion_requests_active_unique ON deletion_requests(user_id) WHERE status IN ('pending','info_requested');
