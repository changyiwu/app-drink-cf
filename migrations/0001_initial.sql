CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  drink_name TEXT NOT NULL,
  size TEXT NOT NULL,
  price INTEGER NOT NULL,
  cups INTEGER NOT NULL,
  sweetness TEXT NOT NULL,
  ice TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_shop_created ON orders (shop_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
