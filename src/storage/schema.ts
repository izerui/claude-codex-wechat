export const schemaSql = `
CREATE TABLE IF NOT EXISTS authorized_users (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL,
  default_provider TEXT NOT NULL,
  default_cwd TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER
);

CREATE TABLE IF NOT EXISTS pairing_requests (
  code TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  display_name TEXT,
  requested_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bridge_sessions (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_session_id TEXT,
  recovery_source TEXT NOT NULL DEFAULT 'runtime',
  resume_title TEXT,
  cwd TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  archived_at INTEGER
);

CREATE TABLE IF NOT EXISTS provider_session_bindings (
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_session_id TEXT NOT NULL,
  cwd TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (platform, chat_id, provider_id)
);

CREATE TABLE IF NOT EXISTS permission_requests (
  id TEXT PRIMARY KEY,
  bridge_session_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT,
  status TEXT NOT NULL,
  decision TEXT,
  requested_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT
);

CREATE TABLE IF NOT EXISTS message_log (
  id TEXT PRIMARY KEY,
  bridge_session_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  platform_message_id TEXT,
  provider_event_type TEXT,
  text TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;
