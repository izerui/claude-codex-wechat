# 2026-06-26 Relay Server Design

## Goal

Build a standalone `relay-server` that can be independently published and deployed, and that assigns a random public subdomain such as `sjdfh2xxx.style520.com` to each connected local bridge agent.

The server must be suitable for:

- independent npm/package release and deployment
- wildcard subdomain routing under a single operator-owned base domain
- a local agent that connects out to the server and exposes a local HTTP service
- random subdomain allocation on each agent start

## Product shape

This is not a general-purpose tunnel platform in phase 1.

It is a single-purpose reverse relay for local bridge agents:

- external user opens `https://<random>.style520.com`
- relay-server maps host → active agent connection
- relay-server forwards HTTP request over a persistent WebSocket to the local agent
- local agent forwards request to `http://127.0.0.1:<bridge-port>`
- agent returns HTTP response over WebSocket
- relay-server returns response to the public caller

## Non-goals

Phase 1 does not implement:

- arbitrary TCP/UDP tunneling
- self-service custom domains
- multi-region routing
- high-scale multi-tenant traffic management
- billing/quotas
- streaming binary optimization
- load balancing one hostname across multiple agents
- durable hostname reservation across restarts

## Deployment boundary

`relay-server` is a standalone service with its own repository/package/release process.

It should be deployable without `claude-codex-wechat` present.

Recommended runtime boundary:

- one standalone Node service
- one operator-provided wildcard DNS entry
- TLS termination handled by the deployment edge (Caddy/Nginx/Cloudflare/etc.) or by the server itself in a later phase

Phase 1 should assume wildcard DNS already points to the relay service:

- `*.style520.com` → relay-server public IP / load balancer

## Subdomain allocation

Relay-server is the source of truth for generated public subdomains.

Rules:

- generate 10-12 random lowercase alphanumeric characters
- random value becomes the host label
- final public URL becomes `https://<label>.style520.com`
- collision checks are required against currently active allocations

Phase 1 allocation lifecycle:

- allocate on successful agent registration
- keep stable for the lifetime of that active connection
- release immediately when the agent disconnects
- next reconnect gets a new random subdomain

This matches the requirement that each startup gets a random subdomain.

## Protocol

Use one persistent WebSocket connection per agent.

Message types:

- `register`
- `registered`
- `request`
- `response`
- `ping`
- `pong`
- `error`

### `register`

Sent by the agent immediately after WebSocket connect.

Fields:

- `type: "register"`
- `clientVersion`
- `targetBaseUrl`
- `authToken`

Phase 1 `targetBaseUrl` is expected to be the local bridge origin, such as `http://127.0.0.1:8787`.

### `registered`

Sent by relay-server after a successful registration.

Fields:

- `type: "registered"`
- `connectionId`
- `subdomain`
- `publicUrl`

### `request`

Sent by relay-server to the agent when a public HTTP request arrives.

Fields:

- `type: "request"`
- `requestId`
- `method`
- `path`
- `headers`
- `bodyBase64`

### `response`

Sent by the agent back to relay-server.

Fields:

- `type: "response"`
- `requestId`
- `status`
- `headers`
- `bodyBase64`

### `ping` / `pong`

Heartbeat only.

## HTTP behavior

Relay-server must:

- route by `Host` header to the active agent connection
- reject unknown subdomains with `404`
- reject requests when the mapped connection is gone with `502` or `504`
- preserve method, path, query string, headers, and body

Phase 1 should target ordinary HTTP API and HTML traffic only.

It does not need to optimize:

- WebSocket pass-through
- SSE tuning
- large upload/download streaming

## Authentication

Phase 1 should require a static operator-configured token.

Server config:

- `RELAY_AUTH_TOKEN`

Agent `register.authToken` must match it.

If invalid:

- close the WebSocket
- do not allocate a subdomain

## Runtime observability

Relay-server should expose enough logs to debug:

- agent connected
- registration accepted/rejected
- subdomain allocated/released
- public request routed
- request timeout
- agent disconnected

Phase 1 logging can remain stdout/stderr based.

## Repository structure

Recommended standalone repository structure:

- `package.json`
- `README.md`
- `bin/relay-server.mjs`
- `src/config.mjs`
- `src/server.mjs`
- `src/wsRegistry.mjs`
- `src/domainRegistry.mjs`
- `src/protocol.mjs`
- `src/httpProxy.mjs`
- `tests/*.test.mjs`

Responsibilities:

- `config.mjs` — env parsing and normalization
- `server.mjs` — HTTP + WebSocket bootstrap
- `wsRegistry.mjs` — active agent connection tracking
- `domainRegistry.mjs` — random subdomain generation and ownership mapping
- `protocol.mjs` — message validation and codecs
- `httpProxy.mjs` — public HTTP request → agent request/response bridge

## Release model

Phase 1 should be npm-publishable as a normal Node package.

Do not start with a binary-runner model unless required.

Once the service stabilizes, it may later adopt a runner/distribution model similar to happier's relay-server runner, but that is not required for the MVP.

## Required environment configuration

Minimal server env:

- `RELAY_PORT`
- `RELAY_BASE_DOMAIN=style520.com`
- `RELAY_AUTH_TOKEN=<token>`

Optional later:

- `RELAY_PUBLIC_ORIGIN`
- `RELAY_TRUST_PROXY`
- `RELAY_LOG_LEVEL`

## Testing

### Unit tests

- random subdomain generation
- collision avoidance
- host → connection resolution
- protocol validation

### Integration tests

- agent registers and receives a public URL
- public HTTP request reaches the agent
- agent response returns to caller
- disconnect releases hostname
- invalid auth token is rejected

## Open decisions resolved by this design

- repository boundary: standalone independent package/repo
- public hostname ownership: server allocates
- startup behavior: random subdomain every fresh connection lifecycle
- transport: WebSocket
- protocol scope: HTTP request/response tunneling only
