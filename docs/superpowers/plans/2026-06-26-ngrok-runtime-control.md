# Ngrok Runtime Control Implementation Plan

> Historical implementation plan only.
>
> This plan targeted an earlier `ngrok` runtime-control implementation that is no longer the active direction.
> The current codebase has removed the shipped `ngrok` runtime path and uses the custom `relay-server` flow instead.
> Do not use this document as the current execution plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add web-admin-controlled ngrok public exposure that persists `enabled` state, auto-restores on daemon restart, and never breaks the main bridge service.

**Architecture:** Introduce a daemon-scoped `NgrokManager` that owns ngrok process lifecycle and status, persist a minimal `ngrok.enabled` setting in the existing config file, expose dedicated admin APIs, and surface status/control in the existing React admin UI. Keep ngrok isolated from provider, session, and channel flows.

**Tech Stack:** TypeScript, Fastify, React, Vitest

---

### Task 1: Extend config and settings shape for `ngrok.enabled`

**Files:**
- Modify: `src/daemon/config.ts`
- Modify: `src/daemon/configPersistence.ts`
- Modify: `src/admin/settingsRoutes.ts`
- Test: `tests/channelAdminRoutes.test.ts`

- [ ] Add a failing route/config persistence test that proves `/api/settings` reads and writes `ngrok.enabled`.
- [ ] Run the targeted test and confirm it fails for missing ngrok settings support.
- [ ] Implement config normalization and persistence for `bridge.ngrok.enabled`.
- [ ] Update settings route types to include `ngrok.enabled`.
- [ ] Re-run the targeted settings test and confirm it passes.

### Task 2: Add failing unit tests for daemon-side ngrok runtime management

**Files:**
- Create: `src/runtime/ngrokManager.ts`
- Create: `tests/ngrokManager.test.ts`

- [ ] Add failing unit tests for missing binary, successful start, public URL resolution, repeated start idempotency, stop behavior, and child exit handling.
- [ ] Run the new ngrok manager test file and confirm it fails.
- [ ] Implement the minimal `NgrokManager` API and internal state transitions needed to satisfy the tests.
- [ ] Re-run the ngrok manager tests and confirm they pass.

### Task 3: Add admin routes for ngrok status/start/stop/settings

**Files:**
- Create: `src/admin/ngrokRoutes.ts`
- Modify: `src/daemon/server.ts`
- Test: `tests/channelAdminRoutes.test.ts`

- [ ] Add failing route tests for `GET /api/ngrok/status`, `POST /api/ngrok/start`, `POST /api/ngrok/stop`, and `POST /api/ngrok/settings`.
- [ ] Run the targeted route tests and confirm they fail.
- [ ] Register ngrok routes in the daemon and wire them to the settings/config path and manager instance.
- [ ] Re-run the targeted route tests and confirm they pass.

### Task 4: Auto-restore ngrok on daemon startup

**Files:**
- Modify: `src/daemon/bootstrap.ts`
- Modify: `src/daemon/server.ts`
- Test: `tests/channelAdminRoutes.test.ts`

- [ ] Add a failing integration-style test proving that persisted `ngrok.enabled=true` causes daemon runtime startup to attempt ngrok launch after the server port is known.
- [ ] Run the targeted startup test and confirm it fails.
- [ ] Implement daemon bootstrap/server wiring so ngrok manager is initialized with the actual listen port and auto-starts only after the daemon is ready.
- [ ] Re-run the targeted startup test and confirm it passes.

### Task 5: Add frontend API client and ngrok panel tests

**Files:**
- Modify: `src/web/apiClient.ts`
- Modify: `src/web/App.tsx`
- Test: `tests/web/appDashboard.test.tsx`
- Test: `tests/web/appInteractions.test.tsx`

- [ ] Add failing frontend tests for displaying ngrok runtime status, showing install/error states, invoking enable/disable actions, and displaying/copying the public URL.
- [ ] Run the targeted frontend tests and confirm they fail.
- [ ] Add API client methods and the ngrok panel UI with the expected runtime states and actions.
- [ ] Re-run the targeted frontend tests and confirm they pass.

### Task 6: Verify end-to-end targeted coverage

**Files:**
- Modify: `docs/superpowers/specs/2026-06-26-ngrok-runtime-control-design.md` (only if implementation changes the approved design)

- [ ] Run backend targeted suites covering settings, ngrok manager, and admin routes.
- [ ] Run frontend targeted suites covering the ngrok panel.
- [ ] Review for any naming or type drift between config, routes, runtime manager, and UI.
- [ ] If the implementation required a design change, update the design doc to match the shipped behavior.
