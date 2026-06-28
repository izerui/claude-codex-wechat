# 2026-06-26 Relay Tunnel Provider Integration Design

> Historical transition design note.
>
> Parts of this document describe the temporary coexistence period between `ngrok` and relay.
> The shipped codebase has since moved to relay-only local development and mainline tunnel support.
> Read this file as design history; for current behavior, follow the runtime code, README, and relay deployment docs.

## Goal

Teach `claude-codex-wechat` to connect to an independently deployed `relay-server`, receive a random public subdomain on each startup, and expose that public URL in the existing admin and WeChat control flows.

## Scope

This spec covers the bridge-side integration only.

It assumes `relay-server` exists as an external independently deployable service described in:

- [2026-06-26-relay-server-design.md](./2026-06-26-relay-server-design.md)

## Product behavior

The bridge should support a tunnel provider mode named `relay`.

When relay is enabled:

- the bridge starts a local relay agent
- the agent connects to `relay-server`
- the relay server returns a public URL
- the admin UI shows that public URL
- `/help` includes that public URL

When relay is disabled:

- the local agent disconnects
- the admin UI falls back to showing the local/LAN address
- `/help` falls back to the local/LAN address

## Coexistence with current ngrok path

Phase 1 integration should avoid ripping out ngrok immediately.

Recommended transition:

- keep current tunnel-management surface
- introduce an internal tunnel-provider abstraction
- allow config to choose `relay` as the active provider
- keep `ngrok` as a fallback/legacy provider during migration

Do not attempt UI provider-picking in phase 1 unless required.

It is enough for config to decide that the active provider is `relay`.

## Config model

Extend bridge config with a tunnel section:

```json
{
  "tunnel": {
    "provider": "relay",
    "enabled": true,
    "relay": {
      "serverUrl": "wss://relay.style520.com/agent",
      "authToken": "replace-me"
    }
  }
}
```

Phase 1 fields:

- `provider`
- `enabled`
- `relay.serverUrl`
- `relay.authToken`

Do not add user-facing custom subdomain settings in phase 1.

The server is authoritative for random subdomain allocation.

## Runtime architecture

Add a `RelayTunnelProvider` under the runtime layer.

Responsibilities:

- establish WebSocket connection to `relay-server`
- send `register`
- receive `registered`
- persist current public URL in runtime state
- answer `request` messages by proxying to local bridge HTTP origin
- return `response`
- maintain heartbeats
- reconnect automatically on disconnect

The local target should default to the running daemon origin:

- `http://127.0.0.1:<bridge-port>`

## Internal abstraction

The current ngrok runtime surface should be generalized into a tunnel-manager/provider boundary.

Recommended contract:

- `getStatus()`
- `start()`
- `stop()`
- `setEnabled(enabled)`

Shared status shape:

- `installed`
- `enabled`
- `running`
- `status`
- `publicUrl`
- `error`

For relay:

- `installed` can mean “provider configured and client code available”, not binary presence

## Request proxy behavior

When `request` arrives from relay-server:

1. validate message
2. send HTTP request to local bridge origin
3. collect response
4. send `response` back with same `requestId`

Phase 1 can proxy with `fetch`.

Do not optimize for:

- streaming bodies
- backpressure-aware piping
- WebSocket upgrade forwarding

## Address display and `/help`

Current admin behavior should become:

- if active tunnel provider is running and has `publicUrl`, show it
- else show preferred local/LAN address

Current `/help` behavior should become:

- if relay public URL exists, emit that address
- else emit preferred local/LAN address

This must work without special-casing relay vs ngrok in the message layer.

It should ask a single “current preferred externally useful address” source.

## Admin UI behavior

Phase 1 UI can stay simple:

- existing single public-access control surface
- no provider picker required
- button enables/disables relay when config says provider is `relay`
- address line shows relay public URL when connected

The UI should not need to expose random subdomain generation details.

## Failure handling

Relay integration must never take down the bridge daemon.

Required cases:

- relay server unreachable
- auth rejected
- register timeout
- request proxy failure
- disconnect after registration

In all cases:

- local admin UI still loads
- local WeChat channel still works
- bridge core features remain available locally

## Files likely affected in this repo

- `src/daemon/config.ts`
- `src/daemon/server.ts`
- `src/runtime/` (new relay provider file)
- `src/session/messageRouter.ts`
- `src/shared/bridgeCommandHelp.ts`
- `src/web/App.tsx`
- `src/web/apiClient.ts`

Likely new files:

- `src/runtime/relayTunnelProvider.ts`
- relay provider tests

## Testing

### Unit tests

- register/registered flow
- reconnect flow
- request → local fetch → response flow
- public URL state handling

### Integration tests

- bridge starts with relay config and connects successfully
- bridge receives public URL from relay
- `/help` returns relay URL
- UI shows relay URL

## Phase order

### Phase 1

- add config shape
- add provider abstraction
- add `RelayTunnelProvider`
- wire `/help` and UI address sourcing to current active provider

### Phase 2

- add better diagnostics and reconnect reporting
- optionally rename `/api/ngrok/*` into provider-agnostic `/api/tunnel/*`

## Open decisions resolved by this design

- bridge integration remains in current repo
- relay server remains external and independently deployable
- subdomain generation remains server-owned
- bridge startup should be enough to obtain a random public URL when relay is enabled
