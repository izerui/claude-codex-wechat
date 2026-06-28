# 2026-06-28 Access Code Migration Notes

This note records the remaining `activation*` naming after the relay/access-code terminology migration.

## Current rule

- New UI, frontend logic, and new internal naming should prefer `accessCode` / `access_*`.
- Existing `activation*` names are retained only where compatibility or external protocol stability still matters.
- As of the current cleanup pass, the remaining `activation*` traces are largely confined to compatibility aliases, protocol/route compatibility, and config/env compatibility.

Evidence now in place:

- relay-server integration tests cover both the historical `activationSecret` input path and the internal `accessCodeSecret` input path
- relay-server integration tests also verify that the legacy response field `activationCode` stays equal to `accessCode`
- relay-server admin page tests verify that the page markup uses `data-access-code` and no longer uses `data-activation-code`
- relay-server config tests verify that `RELAY_ACTIVATION_SECRET` still surfaces on the public `activationSecret` config key
- web tests now include direct coverage for `resetBridgeEventsForTests()`, which stabilizes the shared bridge-events singleton between cases
- web compatibility tests verify that `src/web/activationCode.ts` legacy exports still point at the `accessCode` implementations
- relay-server compatibility tests verify that legacy activation signing/encoding exports still point at the `access-code` implementations

Concrete test locations:

- [relay-server/tests/server.integration.test.mjs](../relay-server/tests/server.integration.test.mjs)
  - access-code generation
  - `activationSecret` / `accessCodeSecret` input compatibility
  - `activationCode === accessCode` response compatibility
  - admin-page `data-access-code` markup migration
- [relay-server/tests/config.test.mjs](../relay-server/tests/config.test.mjs)
  - `RELAY_ACTIVATION_SECRET` -> public `activationSecret` config compatibility
- [relay-server/tests/compatibility-exports.test.mjs](../relay-server/tests/compatibility-exports.test.mjs)
  - legacy relay-server export aliases
- [tests/web/appInteractions.test.tsx](../tests/web/appInteractions.test.tsx)
  - access-code import flow
  - legacy error normalization
- [tests/web/bridgeEventsSocket.test.ts](../tests/web/bridgeEventsSocket.test.ts)
  - `resetBridgeEventsForTests()` singleton reset behavior
- [tests/web/activationCodeCompat.test.ts](../tests/web/activationCodeCompat.test.ts)
  - legacy web export aliases

Verification commands:

- `pnpm relay:test`
- `pnpm test tests/web/activationCodeCompat.test.ts tests/web/bridgeEventsSocket.test.ts tests/web/appInteractions.test.tsx`
- `pnpm typecheck`

Latest verification snapshot:

- `pnpm relay:test`
  - passed with `34` relay-server tests
- `pnpm test`
  - passed with `61` test files green and `357` tests green (`7` skipped)
- `pnpm test tests/web/activationCodeCompat.test.ts tests/web/bridgeEventsSocket.test.ts tests/web/appInteractions.test.tsx`
  - passed with `3` test files green and `30` tests green
- `pnpm typecheck`
  - passed

Current audit result:

- Repository-wide scans now show the remaining `activation*` traces are consistent with the compatibility categories listed below.

Implementation status:

- Outside explicit compatibility bridges, the main UI and relay implementation paths now prefer `accessCode` / `access_*`.
- Remaining implementation-layer `activation*` usages are primarily:
  - compatibility aliases
  - protocol/route compatibility shims
  - config/env compatibility keys and the local reads that mirror them
- In the current codebase, no obvious low-risk main-implementation `activation*` leftovers remain outside those compatibility boundaries.

## Remaining `activation*` groups

### 1. Compatibility layer

These names should remain until downstream callers no longer need the old API surface.

- [src/web/activationCode.ts](../src/web/activationCode.ts)
  - compatibility re-export only
  - verified by [tests/web/activationCodeCompat.test.ts](../tests/web/activationCodeCompat.test.ts)
- [src/web/accessCode.ts](../src/web/accessCode.ts)
  - `decodeRelayActivationCode`
  - `signActivationBodyForTest`
  - verified by [tests/web/activationCodeCompat.test.ts](../tests/web/activationCodeCompat.test.ts)
- [relay-server/src/activationSigning.mjs](../relay-server/src/activationSigning.mjs)
  - `signActivationPayload`
  - `signActivationBody`
  - verified by [relay-server/tests/compatibility-exports.test.mjs](../relay-server/tests/compatibility-exports.test.mjs)
- [relay-server/src/activationCode.mjs](../relay-server/src/activationCode.mjs)
  - `encodeActivationCode`
  - verified by [relay-server/tests/compatibility-exports.test.mjs](../relay-server/tests/compatibility-exports.test.mjs)

### 2. Protocol and route compatibility

These names are still part of the wire/API contract and should not be renamed casually.

- [relay-server/src/server.mjs](../relay-server/src/server.mjs)
  - `POST /admin/activation-code`
  - response fallback field `activationCode`
  - verified by [relay-server/tests/server.integration.test.mjs](../relay-server/tests/server.integration.test.mjs)
- [relay-server/src/adminPage.mjs](../relay-server/src/adminPage.mjs)
  - still calls `/admin/activation-code`
  - still keeps the legacy fallback read `payload.activationCode`
  - verified by [relay-server/tests/server.integration.test.mjs](../relay-server/tests/server.integration.test.mjs)
- [src/web/accessCode.ts](../src/web/accessCode.ts)
  - legacy error normalization:
    - `activation_code_expired`
    - `invalid_activation_code`
    - `activation_signature_secret_missing`
    - `activation_code_signature_invalid`
  - exercised by [tests/web/appInteractions.test.tsx](../tests/web/appInteractions.test.tsx)

### 3. Configuration compatibility

These remain because the environment/config interface is already exposed.

- `RELAY_ACTIVATION_SECRET`
- the public config shape still exposes `activationSecret`
  - see [relay-server/src/config.mjs](../relay-server/src/config.mjs)
  - verified by [relay-server/tests/config.test.mjs](../relay-server/tests/config.test.mjs)
- some local reads intentionally mirror that compatibility shape before converting back to internal `accessCodeSecret` naming
  - see [relay-server/src/server.mjs](../relay-server/src/server.mjs)
- test window hook `__relayActivationSecret`
  - see [src/web/WeChatPanel.tsx](../src/web/WeChatPanel.tsx)
  - exercised by [tests/web/appInteractions.test.tsx](../tests/web/appInteractions.test.tsx)

### 4. Historical test naming

These are safe to rename later if desired, but they are not urgent because they do not affect runtime compatibility.

- most historical temp directory names, test secret literals, and test titles have already been renamed to `access-code` terminology
- relay-server README example secret values have also been rewritten to `access-code` terminology while keeping the historical env key name
- the remaining `activation*` traces in tests are mainly config/runtime variable names that intentionally mirror compatibility-facing env/config fields

## Recommended future cleanup order

1. Keep protocol paths and env names stable unless there is an explicit migration plan.
2. Prefer removing compatibility re-exports only after all repo-internal imports stop using them and external consumers are known.
3. Rename historical test labels last; they are low value and create diff noise.

## Stop Line

At the current state, further `activation*` cleanup is no longer mostly a low-risk naming pass.

Any additional rename/removal work is likely to touch one of these compatibility-facing surfaces:

- public env/config keys
- HTTP routes
- response field compatibility
- exported compatibility aliases

Treat changes beyond this point as an explicit migration project, not routine cleanup.
