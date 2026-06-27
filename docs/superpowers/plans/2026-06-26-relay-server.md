# Relay Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone deployable `relay-server` that allocates a random `*.style520.com` subdomain to each connected agent and reverse-proxies HTTP traffic over a WebSocket tunnel.

**Architecture:** A single Node service terminates public HTTP requests and a separate WebSocket agent channel. The service allocates a random subdomain during agent registration, maps `Host` to the active connection, forwards request envelopes over WebSocket, and returns response envelopes to the caller.

**Tech Stack:** Node.js, Fastify or native HTTP, WebSocket, Vitest / Node test runner

---

### Task 1: Scaffold standalone relay-server package

**Files:**
- Create: `relay-server/package.json`
- Create: `relay-server/README.md`
- Create: `relay-server/bin/relay-server.mjs`
- Create: `relay-server/src/config.mjs`
- Create: `relay-server/tests/config.test.mjs`

- [ ] Write failing tests for env/config parsing: base domain, port, auth token, and defaults.
- [ ] Run the config test file and confirm it fails.
- [ ] Create the standalone package scaffold and minimal config parser.
- [ ] Re-run the config tests and confirm they pass.

### Task 2: Implement random subdomain registry

**Files:**
- Create: `relay-server/src/domainRegistry.mjs`
- Create: `relay-server/tests/domainRegistry.test.mjs`

- [ ] Write failing tests for random subdomain allocation, collision avoidance, lookup by host, and release on disconnect.
- [ ] Run the registry tests and confirm they fail.
- [ ] Implement the in-memory domain registry.
- [ ] Re-run the registry tests and confirm they pass.

### Task 3: Implement protocol validation and connection registry

**Files:**
- Create: `relay-server/src/protocol.mjs`
- Create: `relay-server/src/wsRegistry.mjs`
- Create: `relay-server/tests/protocol.test.mjs`
- Create: `relay-server/tests/wsRegistry.test.mjs`

- [ ] Write failing tests for `register`, `registered`, `request`, `response`, `ping`, and `pong` message validation.
- [ ] Write failing tests for storing/removing active WebSocket agent connections.
- [ ] Run both test files and confirm they fail.
- [ ] Implement protocol guards and WebSocket connection registry.
- [ ] Re-run the tests and confirm they pass.

### Task 4: Implement public HTTP request → agent request/response bridge

**Files:**
- Create: `relay-server/src/httpProxy.mjs`
- Create: `relay-server/tests/httpProxy.test.mjs`

- [ ] Write failing tests for host-based routing, unknown host `404`, disconnected agent `502`, and a full request/response round-trip.
- [ ] Run the http proxy tests and confirm they fail.
- [ ] Implement request envelope dispatch and response correlation by `requestId`.
- [ ] Re-run the tests and confirm they pass.

### Task 5: Implement relay server bootstrap

**Files:**
- Create: `relay-server/src/server.mjs`
- Modify: `relay-server/bin/relay-server.mjs`
- Create: `relay-server/tests/server.integration.test.mjs`

- [ ] Write a failing integration test for agent registration returning a random subdomain and public URL.
- [ ] Extend that integration test to cover a real public HTTP request reaching the agent and returning a response.
- [ ] Run the integration test and confirm it fails.
- [ ] Implement the HTTP + WebSocket bootstrap and wire config, protocol, registry, and proxy modules together.
- [ ] Re-run the integration test and confirm it passes.

### Task 6: Prepare standalone publish/deploy documentation

**Files:**
- Modify: `relay-server/README.md`

- [ ] Document standalone deployment, wildcard DNS expectation, required env vars, and a minimal run command.
- [ ] Document that each fresh agent connection receives a new random subdomain.
