# Relay Tunnel Provider Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach `claude-codex-wechat` to connect to an independently deployed `relay-server`, receive a random public URL on startup, and expose that URL in the admin UI and `/help`.

**Architecture:** Add a `RelayTunnelProvider` runtime component behind the existing tunnel-management surface. Config chooses `relay` as the active provider, the provider connects out to `relay-server`, proxies local bridge HTTP traffic over WebSocket, and surfaces provider-agnostic status with `publicUrl`.

**Tech Stack:** TypeScript, Fastify, WebSocket client, React, Vitest

---

### Task 1: Extend config with relay tunnel settings

**Files:**
- Modify: `src/daemon/config.ts`
- Modify: `src/daemon/configPersistence.ts`
- Create: `tests/relayTunnelConfig.test.ts`

- [ ] Write failing tests for reading `tunnel.provider`, `tunnel.enabled`, `tunnel.relay.serverUrl`, and `tunnel.relay.authToken`.
- [ ] Run the config test and confirm it fails.
- [ ] Implement config normalization and persistence for relay tunnel settings.
- [ ] Re-run the config test and confirm it passes.

### Task 2: Add a provider-agnostic tunnel runtime contract

**Files:**
- Modify: `src/admin/ngrokRoutes.ts`
- Create: `src/runtime/tunnelProvider.ts`
- Modify: existing ngrok runtime wiring files as needed
- Test: `tests/channelAdminRoutes.test.ts`

- [ ] Write failing tests that prove the admin surface can operate against a generic tunnel provider, not just ngrok.
- [ ] Run the targeted route tests and confirm they fail.
- [ ] Introduce a provider-agnostic runtime contract and keep ngrok compatible with it.
- [ ] Re-run the targeted route tests and confirm they pass.

### Task 3: Implement `RelayTunnelProvider`

**Files:**
- Create: `src/runtime/relayTunnelProvider.ts`
- Create: `tests/relayTunnelProvider.test.ts`

- [ ] Write failing unit tests for connect → register → registered flow, reconnect, public URL capture, and request/response proxying.
- [ ] Run the relay provider tests and confirm they fail.
- [ ] Implement the minimal relay provider.
- [ ] Re-run the relay provider tests and confirm they pass.

### Task 4: Wire relay provider into daemon startup

**Files:**
- Modify: `src/daemon/bootstrap.ts`
- Modify: `src/daemon/server.ts`
- Test: `tests/ngrokBootstrap.test.ts` or a new relay bootstrap test

- [ ] Write a failing startup test proving that relay-enabled config starts the relay provider and captures a public URL.
- [ ] Run the bootstrap test and confirm it fails.
- [ ] Wire config-selected provider startup into daemon bootstrap.
- [ ] Re-run the bootstrap test and confirm it passes.

### Task 5: Route `/help` and address display through the active tunnel provider

**Files:**
- Modify: `src/session/messageRouter.ts`
- Modify: `src/shared/bridgeCommandHelp.ts`
- Modify: `src/web/App.tsx`
- Modify: `src/web/apiClient.ts`
- Test: `tests/channelMessageFlow.test.ts`
- Test: `tests/web/appDashboard.test.tsx`

- [ ] Write failing tests that `/help` prefers relay public URL and that the dashboard shows relay public URL when connected.
- [ ] Run the targeted tests and confirm they fail.
- [ ] Implement provider-agnostic preferred-address sourcing for help and UI.
- [ ] Re-run the targeted tests and confirm they pass.

### Task 6: Keep current public-control UX simple

**Files:**
- Modify: `src/web/App.tsx`
- Test: `tests/web/appInteractions.test.tsx`

- [ ] Write failing tests for enabling/disabling relay using the same compact header control used today.
- [ ] Run the interaction tests and confirm they fail.
- [ ] Implement relay-backed enable/disable behavior without adding provider-selection UI.
- [ ] Re-run the interaction tests and confirm they pass.
