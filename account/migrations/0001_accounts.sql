-- ZEVANT game accounts (Cloudflare D1).
-- Apply: npx wrangler d1 migrations apply zevant-accounts --remote   (see account/README.md)

CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,           -- random UUID, never shown to players
  login_id            TEXT NOT NULL,              -- as the player typed it
  login_id_norm       TEXT NOT NULL UNIQUE,       -- lower-case key for sign-in and uniqueness
  display_name        TEXT NOT NULL,
  password_hash       TEXT NOT NULL,              -- pbkdf2_sha256$<iterations>$<salt>$<hash>
  created_at          INTEGER NOT NULL,           -- epoch milliseconds
  updated_at          INTEGER NOT NULL,
  password_changed_at INTEGER NOT NULL,
  last_login_at       INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,                  -- public id (device list / revoke)
  token_hash   TEXT NOT NULL UNIQUE,              -- SHA-256 of the cookie token; the token itself is never stored
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  persistent   INTEGER NOT NULL DEFAULT 0,        -- 1 = "stay signed in"
  user_agent   TEXT,
  country      TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_at);

-- Failed sign-in / sign-up counters. Keys hold a login id or a SHA-256 of the client IP, never the raw IP.
CREATE TABLE IF NOT EXISTS auth_throttle (
  key          TEXT PRIMARY KEY,
  failures     INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);
