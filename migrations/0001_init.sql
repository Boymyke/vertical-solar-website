-- Vertical Solar platform schema (Cloudflare D1 / SQLite)
PRAGMA foreign_keys = ON;

-- ─── Accounts & security ─────────────────────────────────────────────
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT,
  job_title TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','admin','staff')),
  permissions TEXT NOT NULL DEFAULT '[]',          -- JSON array of module keys
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  avatar TEXT,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                -- SHA-256 of the cookie token
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT, user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, action TEXT NOT NULL, entity TEXT, entity_id TEXT, meta TEXT, ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON audit_log(created_at);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,                    -- NULL = every admin with access to the module
  module TEXT,                        -- permission key used to target admins
  type TEXT NOT NULL DEFAULT 'info',  -- info | warning | danger | success
  title TEXT NOT NULL, body TEXT, link TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE notification_reads (
  notification_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX idx_notifications_created ON notifications(created_at);

CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE, filename TEXT, content_type TEXT, size INTEGER,
  folder TEXT DEFAULT 'general', uploaded_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── CRM & Sales ─────────────────────────────────────────────────────
CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, company TEXT, email TEXT, phone TEXT, whatsapp TEXT,
  address TEXT, city TEXT, state TEXT, lat REAL, lng REAL,
  segment TEXT DEFAULT 'residential',           -- residential | commercial | industrial | government
  status TEXT NOT NULL DEFAULT 'lead',          -- lead | customer | inactive
  stage TEXT NOT NULL DEFAULT 'new',            -- new | contacted | site_survey | quoted | negotiation | won | lost
  source TEXT DEFAULT 'manual',                 -- website | chatbot | quote_form | shop | referral | walk_in | manual ...
  interest TEXT, value_estimate REAL DEFAULT 0, assigned_to INTEGER,
  tags TEXT DEFAULT '[]', notes TEXT,
  last_contacted_at TEXT, next_followup_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_customers_stage ON customers(stage);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_email ON customers(email);

CREATE TABLE activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  user_id INTEGER, type TEXT NOT NULL DEFAULT 'note',   -- note | call | whatsapp | email | visit | system
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_activities_customer ON activities(customer_id);

CREATE TABLE followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  installation_id INTEGER,
  assigned_to INTEGER,
  type TEXT NOT NULL DEFAULT 'call',      -- call | whatsapp | checkup | maintenance | payment | quote | other
  title TEXT NOT NULL, notes TEXT,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | done | skipped
  outcome TEXT, completed_at TEXT, completed_by INTEGER,
  auto INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_followups_due ON followups(status, due_at);

-- ─── Quotation engine ────────────────────────────────────────────────
CREATE TABLE quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',   -- draft | sent | viewed | accepted | declined | expired
  items TEXT NOT NULL DEFAULT '[]',       -- [{description, qty, unit_price, product_id}]
  system TEXT DEFAULT '{}',               -- {inverter_kva, pv_kwp, battery_kwh, battery_type, daily_kwh}
  subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 7.5, vat REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0,
  notes TEXT, terms TEXT, valid_until TEXT,
  created_by INTEGER,
  sent_at TEXT, viewed_at TEXT, view_count INTEGER NOT NULL DEFAULT 0,
  responded_at TEXT, accepted_name TEXT, response_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Inventory & shop ────────────────────────────────────────────────
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE, name TEXT NOT NULL, slug TEXT UNIQUE,
  category TEXT NOT NULL DEFAULT 'accessories', -- panels | inverters | batteries | charge-controllers | kits | accessories | services
  brand TEXT, description TEXT, specs TEXT DEFAULT '{}',
  price REAL NOT NULL DEFAULT 0, compare_price REAL, cost REAL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0, reorder_level INTEGER NOT NULL DEFAULT 5,
  unit TEXT DEFAULT 'pcs', location TEXT,
  images TEXT DEFAULT '[]', warranty_months INTEGER DEFAULT 12,
  in_shop INTEGER NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE stock_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL, reason TEXT NOT NULL,  -- purchase | sale | installation | adjustment | return | damaged
  ref TEXT, note TEXT, user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_stock_moves_product ON stock_moves(product_id);

CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, contact TEXT, phone TEXT, email TEXT, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  customer_id INTEGER, name TEXT NOT NULL, email TEXT, phone TEXT NOT NULL,
  address TEXT, city TEXT, state TEXT,
  items TEXT NOT NULL DEFAULT '[]', subtotal REAL NOT NULL DEFAULT 0, delivery REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | paid | processing | delivered | cancelled
  payment_method TEXT DEFAULT 'transfer', payment_ref TEXT, paid_at TEXT,
  notes TEXT, admin_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Installations & field staff ─────────────────────────────────────
CREATE TABLE installations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  quote_id INTEGER,
  title TEXT NOT NULL,
  address TEXT, lat REAL, lng REAL, radius_m INTEGER NOT NULL DEFAULT 150,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | in_progress | completed | on_hold | cancelled
  progress INTEGER NOT NULL DEFAULT 0,
  start_date TEXT, end_date TEXT, completed_at TEXT,
  system TEXT DEFAULT '{}', notes TEXT,
  warranty_months INTEGER DEFAULT 12,
  maintenance_interval_months INTEGER DEFAULT 6,
  next_maintenance_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE installation_staff (
  installation_id INTEGER NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (installation_id, user_id)
);

CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id INTEGER REFERENCES installations(id) ON DELETE SET NULL,
  clock_in_at TEXT NOT NULL, in_lat REAL, in_lng REAL, in_accuracy REAL, in_distance REAL,
  clock_out_at TEXT, out_lat REAL, out_lng REAL, out_accuracy REAL, out_distance REAL,
  status TEXT NOT NULL DEFAULT 'open',      -- open | closed | auto_closed
  last_ping_at TEXT, last_lat REAL, last_lng REAL, last_distance REAL,
  offsite INTEGER NOT NULL DEFAULT 0, offsite_since TEXT, offsite_minutes REAL NOT NULL DEFAULT 0,
  lost_contact_alerted INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
CREATE INDEX idx_attendance_user ON attendance(user_id, status);

CREATE TABLE location_pings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  lat REAL, lng REAL, accuracy REAL, distance REAL, inside INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pings_attendance ON location_pings(attendance_id);

CREATE TABLE work_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  installation_id INTEGER REFERENCES installations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  attendance_id INTEGER,
  message TEXT NOT NULL,
  images TEXT NOT NULL DEFAULT '[]',
  progress INTEGER,
  lat REAL, lng REAL,
  reviewed_by INTEGER, reviewed_at TEXT, review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Maintenance, warranties & support ───────────────────────────────
CREATE TABLE warranties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  installation_id INTEGER REFERENCES installations(id) ON DELETE SET NULL,
  product_id INTEGER, item TEXT NOT NULL, serial TEXT, provider TEXT,
  start_date TEXT NOT NULL, end_date TEXT NOT NULL, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE maintenance_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  installation_id INTEGER REFERENCES installations(id) ON DELETE CASCADE,
  customer_id INTEGER,
  scheduled_at TEXT NOT NULL, done_at TEXT,
  technician_id INTEGER,
  type TEXT DEFAULT 'routine',            -- routine | repair | inspection | cleaning
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | done | cancelled
  findings TEXT, cost REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  customer_id INTEGER, name TEXT, email TEXT, phone TEXT,
  subject TEXT NOT NULL, message TEXT NOT NULL,
  category TEXT DEFAULT 'general',   -- general | fault | billing | warranty | installation
  priority TEXT DEFAULT 'normal',    -- low | normal | high | urgent
  status TEXT NOT NULL DEFAULT 'open', -- open | pending | resolved | closed
  assigned_to INTEGER, source TEXT DEFAULT 'website',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER, body TEXT NOT NULL, internal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Website content (CMS) ───────────────────────────────────────────
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, excerpt TEXT, body TEXT NOT NULL DEFAULT '',
  cover TEXT, category TEXT DEFAULT 'news',   -- news | guides | solar-care | case-studies | finance
  tags TEXT DEFAULT '[]', author_id INTEGER, author_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft', published_at TEXT,
  seo_title TEXT, seo_description TEXT, views INTEGER NOT NULL DEFAULT 0, read_minutes INTEGER DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, client TEXT, location TEXT,
  category TEXT DEFAULT 'commercial', summary TEXT, body TEXT,
  pv_kwp REAL, inverter_kw REAL, battery_kwh REAL,
  images TEXT DEFAULT '[]', video_url TEXT,
  featured INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, role TEXT, location TEXT, photo TEXT,
  quote TEXT NOT NULL, rating INTEGER DEFAULT 5,
  video_url TEXT, evidence TEXT DEFAULT '[]',   -- photos of the installation / before-after / bills
  system TEXT, savings TEXT, project_id INTEGER, customer_id INTEGER,
  verified INTEGER NOT NULL DEFAULT 0, consent INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0, sort INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, issuer TEXT, image TEXT, link TEXT, issued_at TEXT,
  published INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE socials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL, icon TEXT NOT NULL, url TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0
);

CREATE TABLE popups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, body TEXT, image TEXT, cta_text TEXT, cta_url TEXT,
  style TEXT DEFAULT 'modal',         -- modal | banner | corner
  pages TEXT DEFAULT '*',             -- '*' or comma separated paths
  trigger TEXT DEFAULT 'delay',       -- load | delay | scroll | exit
  delay_seconds INTEGER DEFAULT 6,
  frequency TEXT DEFAULT 'session',   -- once | session | always
  starts_at TEXT, ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL, answer TEXT NOT NULL, category TEXT DEFAULT 'general',
  published INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0
);

CREATE TABLE packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, tier TEXT DEFAULT 'residential', tagline TEXT,
  inverter_kva REAL, pv_wp REAL, battery_kwh REAL, loads TEXT,
  price_lead_acid REAL, price_lithium REAL,
  featured INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0
);

CREATE TABLE branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, state TEXT, address TEXT, phones TEXT, email TEXT, hours TEXT,
  lat REAL, lng REAL, is_hq INTEGER NOT NULL DEFAULT 0, sort INTEGER DEFAULT 0
);

CREATE TABLE subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE, source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Visitor analytics & heatmaps ────────────────────────────────────
CREATE TABLE pageviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pv_id TEXT NOT NULL, visitor_id TEXT, session_id TEXT,
  path TEXT NOT NULL, title TEXT, referrer TEXT, utm_source TEXT, utm_campaign TEXT,
  country TEXT, region TEXT, city TEXT, lat REAL, lng REAL, timezone TEXT,
  device TEXT, browser TEXT, os TEXT, lang TEXT, screen_w INTEGER,
  duration_s INTEGER DEFAULT 0, max_scroll INTEGER DEFAULT 0, is_new INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pageviews_created ON pageviews(created_at);
CREATE INDEX idx_pageviews_path ON pageviews(path);
CREATE UNIQUE INDEX idx_pageviews_pv ON pageviews(pv_id);

CREATE TABLE heat_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL, device TEXT NOT NULL,        -- mobile | tablet | desktop
  type TEXT NOT NULL DEFAULT 'click',              -- click | move | rage
  x REAL NOT NULL, y REAL NOT NULL,                -- x = fraction of page width, y = px from top of document
  doc_h INTEGER, target TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_heat_path ON heat_events(path, device, created_at);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, path TEXT, visitor_id TEXT, meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── AI chat ─────────────────────────────────────────────────────────
CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  visitor_id TEXT, lang TEXT, country TEXT, city TEXT, page TEXT,
  customer_id INTEGER, contact_name TEXT, contact_phone TEXT,
  messages_count INTEGER NOT NULL DEFAULT 0, voice INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL, content TEXT NOT NULL, mode TEXT DEFAULT 'text', -- text | voice
  user_id INTEGER,                                                     -- set when a human agent replies
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_chat_messages_chat ON chat_messages(chat_id);

-- ─── Email ───────────────────────────────────────────────────────────
CREATE TABLE emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  customer_id INTEGER, status TEXT NOT NULL DEFAULT 'queued', provider_id TEXT, error TEXT,
  sent_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
