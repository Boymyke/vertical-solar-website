-- Guides (manuals) shown to staff inside the app; the administrator can replace or add them.
CREATE TABLE IF NOT EXISTS guides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, description TEXT,
  audience TEXT NOT NULL DEFAULT 'all',          -- all | admin
  file TEXT NOT NULL, pages INTEGER,
  sort INTEGER DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO guides (title, description, audience, file, pages, sort)
SELECT 'Staff guide', 'Signing in, your profile, your schedule, clocking in on site, reporting problems and sending your daily work report.', 'all', '/staff/assets/guides/staff-guide.pdf', 21, 1
WHERE NOT EXISTS (SELECT 1 FROM guides);
INSERT INTO guides (title, description, audience, file, pages, sort)
SELECT 'Administrator guide', 'Every screen of the website and the CRM, step by step: leads, quotes, installations, staff, stock, the shop and website content.', 'admin', '/staff/assets/guides/admin-guide.pdf', 46, 2
WHERE (SELECT COUNT(*) FROM guides) = 1;
