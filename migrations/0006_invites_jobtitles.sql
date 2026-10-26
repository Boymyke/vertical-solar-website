-- One-time sign-in links for new staff (valid until they set their own password, max 7 days).
ALTER TABLE users ADD COLUMN invite_hash TEXT;
ALTER TABLE users ADD COLUMN invite_expires TEXT;
CREATE INDEX IF NOT EXISTS idx_users_invite ON users(invite_hash);
