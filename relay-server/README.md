# relay-server

Standalone relay server prototype for `claude-codex-wechat`.

## Install

```bash
npm install -g @liuyuhua/relay-server
```

## Run With GHCR Image

The repository publishes a container image to GHCR on every push to `main`:

```text
ghcr.io/<github-owner>/relay-server:latest
```

Example:

```bash
docker run -d \
  --name relay-server \
  -p 8788:8788 \
  -e RELAY_BASE_DOMAIN=wechat.example.com \
  -e RELAY_AUTH_TOKEN=replace-me \
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
      RELAY_BASE_DOMAIN: wechat.example.com
      RELAY_AUTH_TOKEN: replace-me
```

## Required env

- `RELAY_BASE_DOMAIN`
- `RELAY_AUTH_TOKEN`
- `RELAY_PORT` optional, defaults to `8788`

## Run

```bash
RELAY_BASE_DOMAIN=style520.com \
RELAY_AUTH_TOKEN=replace-me \
relay-server
```

## DNS

Point the public host to the relay server:

```text
wechat.style520.com -> relay server public IP
```

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
