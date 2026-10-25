-- Cache for machine translations of website text (Igbo, Hausa, Yoruba).
CREATE TABLE IF NOT EXISTS translations (
  lang TEXT NOT NULL,
  hash TEXT NOT NULL,
  src TEXT NOT NULL,
  out TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (lang, hash)
);
