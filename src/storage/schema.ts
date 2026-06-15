export const schemaSql = `
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
`;
