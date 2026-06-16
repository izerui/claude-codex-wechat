export const schemaSql = `
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
