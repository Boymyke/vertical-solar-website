-- Trusted companies shown as a logo strip on the homepage. Sample rows are placeholders to replace in the CRM.
CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  logo TEXT,
  url TEXT,
  sort INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  sample INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO partners (name, sort, sample) VALUES
  ('Brightway Foods', 1, 1), ('Kora Suites', 2, 1), ('Atlas Clinics', 3, 1), ('Harbor Schools', 4, 1),
  ('Meridia Plaza', 5, 1), ('Pinecrest Logistics', 6, 1), ('Oakline Farms', 7, 1), ('Crestview Estates', 8, 1);
