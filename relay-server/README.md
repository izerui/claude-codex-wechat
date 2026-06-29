# relay-server

Standalone relay server prototype for `claude-codex-wechat`.

## Install

```bash
npm install -g @liuyuhua/relay-server
```

## Generate Client Tokens

Generate one token for a client instance:

```bash
relay-server-token
```

Generate a token and append it to the whitelist file:

```bash
relay-server-token --file ./relay-auth-tokens.txt
```

This prints the token to stdout and stores it into the file if you pass `--file`.

## Run With GHCR Image

The repository publishes a container image to GHCR on every push to `main`:

```text
ghcr.io/<github-owner>/relay-server:latest
```

Example:

```bash
cat > relay-auth-tokens.txt <<'EOF'
token-for-client-a
token-for-client-b
EOF

docker run -d \
  --name relay-server \
  -p 8788:8788 \
  -e RELAY_SERVER_URL=wss://wechat.example.com/agent \
  -e RELAY_AUTH_TOKENS_FILE=/run/secrets/relay-auth-tokens.txt \
  -e RELAY_ADMIN_TOKEN=replace-with-a-long-random-admin-token \
  -v "$(pwd)/relay-auth-tokens.txt:/run/secrets/relay-auth-tokens.txt:ro" \
  ghcr.io/<github-owner>/relay-server:latest
```

If you prefer Docker Compose:

```yaml
services:
  relay-server:
    image: ghcr.io/<github-owner>/relay-server:latest
    restart: unless-stopped
    ports:
      - "8788:8788"
    environment:
      RELAY_SERVER_URL: wss://wechat.example.com/agent
      RELAY_AUTH_TOKENS_FILE: /run/secrets/relay-auth-tokens.txt
      RELAY_ADMIN_TOKEN: replace-with-a-long-random-admin-token
    volumes:
      - ./relay-auth-tokens.txt:/run/secrets/relay-auth-tokens.txt:ro
```

## Required env

- `RELAY_SERVER_URL` recommended when the relay public host is deployment-specific
- `RELAY_BASE_DOMAIN` optional compatibility fallback
- `RELAY_AUTH_TOKENS_FILE` optional for a future allow-list mode
- `RELAY_AUTH_TOKENS` optional for a future allow-list mode
- `RELAY_AUTH_TOKEN` optional single-token compatibility mode
- `RELAY_ADMIN_TOKEN` recommended to protect `/admin`, `/admin/*`, `/connections`, and `/connections/*`
- `RELAY_PORT` optional, defaults to `8788`

## Run

```bash
RELAY_SERVER_URL=wss://wechat.style520.com/agent \
RELAY_ADMIN_TOKEN=replace-with-a-long-random-admin-token \
relay-server
```

## DNS

Point the public host to the relay server and make sure it matches `RELAY_SERVER_URL`:

```text
wechat.style520.com -> relay server public IP
```

## Admin Access

When `RELAY_ADMIN_TOKEN` is configured, these endpoints require:

```text
Authorization: Bearer <RELAY_ADMIN_TOKEN>
```

Protected routes:

- `/admin`
- `/admin/tokens`
- `/connections`
- `/connections/:id/disconnect`

## Admin Console

`/admin` is intentionally a minimal online-connections panel.

It only does two things:

- shows which client instances are currently online
- shows each instance's current public URL
- lets the operator disconnect the client

The panel does not expose internal relay details such as upstream target URLs, assigned connection ids, or connection timestamps.

Current row actions:

- `断开连接`

`/connections` returns the fields the admin/API surface may use:

- `authToken`
- `publicUrl`

Operational rule:

- one `authToken` may have only one active websocket connection at a time
- if a second client registers with the same `authToken`, relay-server rejects it with `auth_token_in_use`
- the admin UI uses `authToken` as the operator-facing identity

## Production Checklist

Before exposing `relay-server` on the public internet, make sure all of these are true:

- `RELAY_ADMIN_TOKEN` is set to a different long random secret
- the site is served over `HTTPS`
- `wechat.style520.com` or your own public host points to the relay server
- the client uses `wss://<your-host>/agent`
- `/admin` is only shared with operators, never end users
- if you later enable an allow-list mode, manage and back up the token file separately

## Deployment Order

Minimal production rollout order:

1. Prepare DNS for `wechat.example.com`
2. Create or mount `auth-tokens.txt`
3. Set `RELAY_ADMIN_TOKEN`
4. Start `relay-server`
5. Open `/admin` and enter `RELAY_ADMIN_TOKEN`
6. Wait for the target client instance to appear online
7. Confirm the instance appears online in `/admin`

## Local Development

From the repo root you now have two helper scripts:

```bash
pnpm dev:relay
```

Starts only the local `relay-server` with these dev defaults if you did not override them:

- `RELAY_PORT=8788`
- `RELAY_SERVER_URL=ws://127.0.0.1:8788/agent`
- `RELAY_ADMIN_TOKEN=dev-admin-token`

It also creates `relay-server/relay-auth-tokens.txt` automatically if missing, and the bridge side reuses the persisted `tunnel.relay.authToken` from `config.json`. If that token is missing or still set to the old ad hoc `client-token-a` value, the dev bootstrap upgrades it to a generated `clrt_<24hex>` token and persists it before startup.

To start both the relay and the local bridge together:

```bash
pnpm dev:all
```

This also bootstraps `~/.claude-codex-wechat/config.json` if it does not exist, pointing the bridge at:

```text
ws://127.0.0.1:8788/agent
```

Local dev endpoints:

- relay admin: `http://127.0.0.1:8788/admin`
- relay health: `http://127.0.0.1:8788/healthz`
- bridge admin: `http://127.0.0.1:8787`

## Security Notes

- `RELAY_AUTH_TOKENS_FILE` is for relay client admission, not for browser users
- `RELAY_ADMIN_TOKEN` protects the management plane only
- if a client token leaks, revoke or replace only that client token

## Current phase

Current prototype supports:

- agent registration over WebSocket
- random path token allocation per connection
- path-routed HTTP request forwarding through the agent

## Example public URL

When a bridge agent connects successfully, relay-server allocates a random path such as:

```text
https://wechat.style520.com/sjdfh2xxx
```
