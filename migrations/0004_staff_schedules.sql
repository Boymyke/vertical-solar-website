-- Staff profiles, site schedules with late reminders, on-site issue reports, push notifications,
-- dismissible notifications and editable website policies.

-- One administrator (the owner); everyone else is staff.
UPDATE users SET role = 'staff' WHERE role = 'admin';

-- Staff details collected on first sign-in (JSON: date_of_birth, gender, address, state_of_origin,
-- emergency_name, emergency_phone, emergency_relation, skills, start_date, branch).
ALTER TABLE users ADD COLUMN profile TEXT NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN profile_completed_at TEXT;

-- Notifications a person has closed. They stop showing for that person only.
CREATE TABLE IF NOT EXISTS notification_dismissals (
  notification_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  PRIMARY KEY (notification_id, user_id)
);

-- When a staff member is expected on a job site. Times are stored in UTC.
CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  installation_id INTEGER NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',   -- scheduled | late | arrived | missed | cancelled
  arrived_at TEXT,
  late_minutes INTEGER,
  attendance_id INTEGER,
  reminded_at TEXT,        -- "starts soon" reminder sent to the staff member
  late_notified_at TEXT,   -- "you are running late" sent to the staff member
  escalated_at TEXT,       -- admin told they have not arrived
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_shifts_start ON shifts(status, starts_at);

-- Problems reported from site at any time (not tied to clocking out).
CREATE TABLE IF NOT EXISTS site_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  installation_id INTEGER REFERENCES installations(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',     -- safety | equipment | materials | customer | access | weather | other
  urgency TEXT NOT NULL DEFAULT 'normal',     -- low | normal | high | urgent
  message TEXT NOT NULL,
  images TEXT NOT NULL DEFAULT '[]',
  lat REAL, lng REAL,
  status TEXT NOT NULL DEFAULT 'open',        -- open | acknowledged | resolved
  response TEXT,
  handled_by INTEGER,
  handled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_issues_status ON site_issues(status, created_at);

-- Browser push subscriptions so reminders reach phones even when the app is closed.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT, auth TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- Private key material and other server-only values (never sent to the website).
CREATE TABLE IF NOT EXISTS secrets (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Website policy pages edited from the CRM. A missing row means the built-in text is shown.
CREATE TABLE IF NOT EXISTS policies (
  key TEXT PRIMARY KEY,                       -- privacy | terms | installation-policy | support-policy | accessibility
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Only count stock for products that are actually tracked (reorder level set).
UPDATE products SET reorder_level = 0 WHERE stock <= 0 AND reorder_level > 0
  AND id NOT IN (SELECT DISTINCT product_id FROM stock_moves);
