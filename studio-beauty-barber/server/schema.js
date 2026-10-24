// Esquema portável entre SQLite (piloto/dev) e PostgreSQL (produção).
// Regras: ids TEXT (uuid), datas em ISO-8601 UTC como TEXT, booleanos 0/1, dinheiro em centavos.
export const MIGRATIONS = [
  {
    id: 1,
    sql: `
CREATE TABLE IF NOT EXISTS salons (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  hours_json TEXT,
  brand_json TEXT,
  logo_path TEXT,
  allowed_domains TEXT,
  plan TEXT NOT NULL DEFAULT 'smart',
  status TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at TEXT,
  asaas_customer_id TEXT,
  stripe_customer_id TEXT,
  bot_enabled INTEGER NOT NULL DEFAULT 1,
  quiet_start INTEGER NOT NULL DEFAULT 21,
  quiet_end INTEGER NOT NULL DEFAULT 8,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  staff_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  salon_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  salon_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  ip TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_salon ON audit_log(salon_id, created_at);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  birthday TEXT,
  notes TEXT,
  tags TEXT,
  consent_marketing INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  source TEXT,
  visits INTEGER NOT NULL DEFAULT 0,
  total_spent_cents INTEGER NOT NULL DEFAULT 0,
  last_visit_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clients_salon ON clients(salon_id, name);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(salon_id, phone);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  duration_min INTEGER NOT NULL DEFAULT 30,
  price_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_services_salon ON services(salon_id);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  commission_pct INTEGER NOT NULL DEFAULT 40,
  color TEXT,
  hours_json TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_staff_salon ON staff(salon_id);

CREATE TABLE IF NOT EXISTS staff_services (
  staff_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  PRIMARY KEY (staff_id, service_id)
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  price_cents INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  notes TEXT,
  reminder_24h_sent INTEGER NOT NULL DEFAULT 0,
  reminder_2h_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_salon_day ON appointments(salon_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appt_staff ON appointments(staff_id, starts_at);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 2,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_products_salon ON products(salon_id);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  client_id TEXT,
  appointment_id TEXT,
  staff_id TEXT,
  total_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  asaas_payment_id TEXT,
  pix_payload TEXT,
  invoice_url TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_salon ON sales(salon_id, created_at);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_id TEXT,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_cents INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  company TEXT,
  city TEXT,
  source TEXT,
  utm_json TEXT,
  stage TEXT NOT NULL DEFAULT 'new',
  value_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  owner_id TEXT,
  consent INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  consent_ip TEXT,
  next_action_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_salon ON leads(salon_id, stage);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  external_id TEXT NOT NULL,
  display_name TEXT,
  client_id TEXT,
  lead_id TEXT,
  mode TEXT NOT NULL DEFAULT 'bot',
  status TEXT NOT NULL DEFAULT 'open',
  unread INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0,
  state_json TEXT,
  last_inbound_at TEXT,
  last_message_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (salon_id, channel, external_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_salon ON conversations(salon_id, last_message_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  segment_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaigns_salon ON campaigns(salon_id, created_at);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  salon_id TEXT NOT NULL,
  client_id TEXT,
  lead_id TEXT,
  to_addr TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cr_campaign ON campaign_recipients(campaign_id, status);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  config_enc TEXT NOT NULL,
  ext_key TEXT,
  status TEXT NOT NULL DEFAULT 'configured',
  updated_at TEXT NOT NULL,
  UNIQUE (salon_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_integrations_ext ON integrations(kind, ext_key);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  current_period_end TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE (provider, event_id)
);

CREATE TABLE IF NOT EXISTS optouts (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (salon_id, channel, address)
);

CREATE TABLE IF NOT EXISTS scheduler_runs (
  key TEXT PRIMARY KEY,
  ran_at TEXT NOT NULL
);
`,
  },
  {
    id: 2,
    sql: `
ALTER TABLE salons ADD COLUMN deposit_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE salons ADD COLUMN noshow_retention_pct INTEGER NOT NULL DEFAULT 30;
ALTER TABLE salons ADD COLUMN free_cancel_hours INTEGER NOT NULL DEFAULT 24;
ALTER TABLE appointments ADD COLUMN pay_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE appointments ADD COLUMN pay_ref TEXT;
ALTER TABLE appointments ADD COLUMN paid_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN refunded_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN policy_accepted_at TEXT;
ALTER TABLE appointments ADD COLUMN club_id TEXT;
CREATE INDEX IF NOT EXISTS idx_appt_club ON appointments(club_id, starts_at);

CREATE TABLE IF NOT EXISTS club_memberships (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  interval_days INTEGER NOT NULL,
  preferred_time TEXT NOT NULL,
  discount_pct INTEGER NOT NULL DEFAULT 0,
  cpf_cnpj TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_date TEXT,
  created_at TEXT NOT NULL,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_club_salon ON club_memberships(salon_id, status);
`,
  },
  {
    id: 3,
    sql: `
ALTER TABLE salons ADD COLUMN logo_data TEXT;
ALTER TABLE salons ADD COLUMN logo_mime TEXT;
`,
  },
  {
    id: 4,
    sql: `
ALTER TABLE salons ADD COLUMN lifetime INTEGER NOT NULL DEFAULT 0;
ALTER TABLE services ADD COLUMN recall_days INTEGER;
ALTER TABLE clients ADD COLUMN cashback_optin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN cashback_optin_at TEXT;
ALTER TABLE club_memberships ADD COLUMN charge INTEGER NOT NULL DEFAULT 1;
ALTER TABLE leads ADD COLUMN document TEXT;
ALTER TABLE leads ADD COLUMN category TEXT;
ALTER TABLE leads ADD COLUMN state TEXT;
ALTER TABLE leads ADD COLUMN address TEXT;

CREATE TABLE IF NOT EXISTS recall_log (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  due_since TEXT NOT NULL,
  sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recall_client ON recall_log(salon_id, client_id, service_id);

CREATE TABLE IF NOT EXISTS company_base (
  cnpj TEXT PRIMARY KEY,
  legal_name TEXT,
  trade_name TEXT,
  cnae TEXT NOT NULL,
  uf TEXT,
  city TEXT,
  city_norm TEXT,
  district TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  is_mei INTEGER NOT NULL DEFAULT 0,
  opened_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_company_search ON company_base(cnae, uf, city_norm);

CREATE TABLE IF NOT EXISTS company_imports (
  id TEXT PRIMARY KEY,
  ref_month TEXT,
  status TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS lead_blocks (
  salon_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (salon_id, hash)
);

CREATE TABLE IF NOT EXISTS prospect_invites (
  id TEXT PRIMARY KEY,
  salon_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  sent_at TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_invites_due ON prospect_invites(status, scheduled_at);
`,
  },
  {
    id: 5,
    sql: `
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pwreset_user ON password_resets(user_id, created_at);
`,
  },
];
