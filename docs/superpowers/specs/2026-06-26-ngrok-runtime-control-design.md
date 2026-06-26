# 2026-06-26 ngrok Runtime Control Design

## Goal

Allow the bridge web admin UI to control optional `ngrok` public exposure for the currently running daemon port.

The bridge must:

- not depend on `ngrok` as an npm dependency
- use local `ngrok` only when it is already installed on the machine
- let the user enable/disable exposure from the existing web admin UI
- persist the desired `enabled` state
- auto-restore `ngrok` on daemon restart when enabled
- keep the bridge daemon healthy even if `ngrok` is missing or crashes

## Non-goals

This phase does not implement:

- `ngrok` authtoken management
- fixed domains / reserved domains
- region selection
- multiple tunnels
- exposing any port other than the daemon's actual listen port
- coupling `ngrok` lifecycle to provider/session/message routing

## Product behavior

`ngrok` is an optional runtime companion to the bridge daemon.

- The daemon remains the primary process.
- `ngrok` is a managed child process.
- `ngrok` failure must never stop or degrade WeChat, Claude, Codex, session recovery, or admin APIs outside the ngrok feature itself.

The admin UI is the control surface.

- Users turn exposure on/off from the web page.
- The page shows whether `ngrok` is installed, running, stopped, or in error.
- The page shows the current public URL when running.

The forwarded port always follows the daemon's actual listen port.

- No separate ngrok port setting is exposed.
- If the daemon restarts on a different port, restored ngrok forwards the new daemon port automatically.

## Settings model

Persist a minimal settings block:

```json
{
  "ngrok": {
    "enabled": true
  }
}
```

Only `enabled` is persisted in phase 1.

Runtime-only state such as public URL, install detection, child pid, last error, or launch timestamp must not be stored as durable settings.

## Runtime architecture

Add an isolated `NgrokManager` service under the daemon/runtime layer.

Responsibilities:

- detect whether `ngrok` is available on `PATH`
- start `ngrok http <daemonPort>`
- stop the managed `ngrok` child process
- read and expose runtime state
- capture launch failures and process exits
- provide current public URL when available

The manager must not be created inside provider code, session code, or channel code.

Recommended state shape:

- `installed: boolean`
- `enabled: boolean`
- `running: boolean`
- `status: 'not_installed' | 'stopped' | 'starting' | 'running' | 'error'`
- `publicUrl?: string`
- `error?: string`

## Startup and recovery

Daemon boot sequence:

1. start Fastify and determine the actual listen port
2. create `NgrokManager` with that listen port
3. read persisted settings
4. if `ngrok.enabled === true`, attempt to start `ngrok`

Important rules:

- Do not start `ngrok` before the daemon is listening.
- If `ngrok` is missing, startup still succeeds and runtime state becomes `not_installed`.
- If `ngrok` launch fails, startup still succeeds and runtime state becomes `error`.
- If `ngrok` exits after having started, runtime state must change away from `running` and the error/exit reason should be exposed to the UI.

## Public URL discovery

Phase 1 should prefer a robust local mechanism over scraping terminal output.

Recommended approach:

- launch `ngrok http <port>`
- query the local ngrok inspection API at `http://127.0.0.1:4040/api/tunnels`
- read the HTTPS public URL from the tunnel payload

If the API is not available or the URL cannot be resolved, the manager may still consider ngrok started, but runtime state should remain informative:

- either `running` with missing `publicUrl`
- or `error` with a clear message if startup is considered incomplete

Pick one interpretation and keep it consistent in tests.

## API surface

Add admin-facing endpoints:

- `GET /api/ngrok/status`
- `POST /api/ngrok/start`
- `POST /api/ngrok/stop`
- `POST /api/ngrok/settings`

`GET /api/ngrok/status` returns runtime state plus persisted `enabled`.

`POST /api/ngrok/start`:

- marks desired state enabled
- persists settings
- starts `ngrok` if possible
- returns the updated runtime state

`POST /api/ngrok/stop`:

- marks desired state disabled
- persists settings
- stops the child process if running
- returns the updated runtime state

`POST /api/ngrok/settings`:

- accepts `{ enabled: boolean }`
- acts as the durable toggle endpoint
- if enabling, persist first then attempt start
- if disabling, persist first then stop

Idempotency requirements:

- starting while already running must not spawn a second child
- stopping while already stopped must succeed without error

## Admin UI

Add a dedicated ngrok card/panel to the existing admin UI.

Display:

- install status
- runtime status
- current public URL when present
- latest error when present

Actions:

- `Enable Public Access`
- `Disable Public Access`
- `Copy URL`

UI behavior:

- if `ngrok` is not installed, show a clear install message and disable the enable action or make it fail with an explicit message
- if enabled and running, show the URL prominently
- if enabled but errored, show that auto-restore was requested but failed

## Failure handling

The bridge must never become unavailable because of ngrok issues.

Required cases:

- `ngrok` binary missing
- child spawn failure
- non-zero child exit
- inspection API unavailable
- repeated start requests
- stop request after child already exited

In all of these cases:

- bridge APIs unrelated to ngrok continue to work
- local admin UI continues to work on the local daemon port

## Testing

### Unit tests

Add focused tests for `NgrokManager`:

- detects missing binary
- starts successfully
- resolves public URL
- handles child exit
- handles stop while running
- is idempotent on repeated start/stop

Use mocked process spawning and mocked inspection API responses.

### Route tests

Add tests for:

- `GET /api/ngrok/status`
- `POST /api/ngrok/start`
- `POST /api/ngrok/stop`
- `POST /api/ngrok/settings`

Verify persistence and runtime transitions.

### Frontend tests

Add tests that verify:

- status rendering
- missing-installation messaging
- enable/disable button behavior
- public URL display and copy action

## Files likely affected

- `src/daemon/server.ts`
- `src/admin/*` route assembly
- `src/storage/settingsRepository.ts` or related settings wiring
- `src/web/App.tsx`
- `src/web/apiClient.ts`

New files likely needed:

- `src/runtime/ngrokManager.ts`
- route tests for ngrok admin APIs
- frontend tests for the ngrok panel

## Open decisions resolved by this design

- Control surface: web admin UI
- Persistence: yes, restart should auto-restore
- Port selection: always follow the daemon listen port
- Dependency model: no bundled ngrok dependency; use installed local binary only
