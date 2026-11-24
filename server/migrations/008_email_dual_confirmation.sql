-- Dual approval: password-only accounts must confirm from both mailboxes.
ALTER TABLE email_change_tokens ADD COLUMN kind text NOT NULL DEFAULT 'new';
ALTER TABLE email_change_tokens ADD CONSTRAINT email_change_tokens_kind_check CHECK (kind IN ('old','new'));
