# AgentPod Repo Structure

This document describes the recommended repository structure for AgentPod as an open-source project.

The goal is not maximum abstraction.
The goal is:

- easy to understand
- easy to contribute to
- easy to test
- easy to replace parts later without rewriting everything

## Design goals

For v0.1, the repository should optimize for:

- as few folders as possible
- clear ownership of each file
- flat layout inside each folder — no `src/` nesting
- runtime-specific code kept at the edges
- simple local testing

It should avoid:

- too many micro-packages
- multiple ways to express the same concept
- mixing OpenClaw-specific code with protocol models
- mixing OpenAgents-specific code with AgentPod public types

## Top-level layout

```text
agentpod/
├─ .gitignore
├─ README.md
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.json
├─ vitest.config.ts
├─ docs/
│  ├─ joins.md
│  ├─ architecture-details.md
│  ├─ protocol-v0.1.md
│  ├─ repo-structure.md
│  ├─ AGENTPOD.md.template
│  └─ plans/
├─ plugin/
├─ hub/
├─ examples/
│  ├─ managed-public/
│  ├─ self-hosted-private/
│  └─ private-minimal/
├─ scripts/
└─ test/
   └─ integration/
```

Two code folders. That is all.

`plugin/` is the OpenClaw plugin that end users install.
`hub/` is the server that manages join tokens, peer directory, and task forwarding.

For v0.1, do not add a third code folder. If a concern does not fit cleanly in plugin or hub, put it in the nearest one and document why.

## `plugin/`

This is the actual plugin users install into OpenClaw.

It follows the same flat layout used by other OpenClaw plugins (e.g. openclaw-supermemory):
files live directly under `plugin/`, grouped by role, with no `src/` subdirectory.

```text
plugin/
├─ openclaw.plugin.json
├─ package.json
├─ tsconfig.json
├─ index.ts
├─ config.ts
├─ client.ts
├─ logger.ts
├─ commands/
│  ├─ slash.ts
│  ├─ cli.ts
│  └─ gateway.ts
├─ hooks/
│  ├─ session.ts
│  └─ task.ts
├─ tools/
│  ├─ peers.ts
│  ├─ delegate.ts
│  ├─ join.ts
│  └─ tasks.ts
├─ service/
│  ├─ background.ts
│  ├─ peer-cache.ts
│  └─ substrate-sync.ts
├─ source-doc/
│  ├─ compiler.ts
│  └─ validator.ts
├─ policy/
│  └─ guard.ts
├─ tasks/
│  ├─ runner.ts
│  └─ registry.ts
├─ artifacts/
│  └─ bridge.ts
├─ http/
│  └─ routes.ts
├─ state/
│  └─ store.ts
├─ identity/
│  └─ keys.ts
├─ types/
│  └─ agentpod.d.ts
└─ test/
```

### Plugin file responsibilities

| File / folder | Owns |
| --- | --- |
| `openclaw.plugin.json` | Plugin manifest and config schema declaration |
| `index.ts` | Plugin entrypoint — wires everything together, calls `api.registerService` |
| `config.ts` | Config type, parser, and JSON schema export |
| `client.ts` | Hub API client — WebSocket connection, peer list, task submission |
| `logger.ts` | Logger init helper |
| `commands/slash.ts` | Slash commands: `/agentpod join`, `/agentpod peers`, `/agentpod leave`, `/agentpod tasks`, `/agentpod trust` |
| `commands/cli.ts` | CLI subcommands: `openclaw agentpod join`, `openclaw agentpod peers`, `openclaw agentpod leave`, `openclaw agentpod tasks` |
| `commands/gateway.ts` | Gateway RPC methods: `agentpod.status`, `agentpod.peers.list`, `agentpod.tasks.list`, `agentpod.network.join`, `agentpod.network.leave` |
| `hooks/session.ts` | `before_agent_start` hook — injects peer context into the session if relevant |
| `hooks/task.ts` | `agent_end` hook — dispatches completed spawned task results back to the origin |
| `tools/peers.ts` | `agentpod_peers` tool — reads local peer cache |
| `tools/delegate.ts` | `agentpod_delegate` tool — submits an async task to a remote peer |
| `tools/join.ts` | `agentpod_join` tool — joins or switches network profile |
| `tools/tasks.ts` | `agentpod_tasks` tool — lists local task handles and statuses |
| `service/background.ts` | Background service — WebSocket keep-alive, reconnect, heartbeat |
| `service/peer-cache.ts` | In-memory peer cache — stores and queries the local peer list |
| `service/substrate-sync.ts` | Substrate sync — periodic peer refresh after join or reconnect |
| `source-doc/compiler.ts` | `AGENTPOD.md` parser and compiler — produces a structured `CapabilityManifest` |
| `source-doc/validator.ts` | Validation rules — service id format, uniqueness, required sections; blocks compilation on failure |
| `policy/guard.ts` | Execution guard — resolves effective policy (`owner ∩ service ∩ request`), admission checks, approval requirements |
| `tasks/runner.ts` | Task runner — creates a dedicated spawned task session for each accepted inbound task |
| `tasks/registry.ts` | Task registry — stores task handles, deduplicates by `task_id`, tracks delivery status |
| `artifacts/bridge.ts` | Artifact bridge — normalizes inline vs relay-backed results without leaking OpenAgents artifact objects |
| `http/routes.ts` | Plugin-owned HTTP routes — artifact bridge ingress and local plugin-owned endpoints; remote task delivery still arrives over the outbound substrate connection |
| `state/store.ts` | File-backed local state — network credentials, directory cache, task history, peer trust metadata |
| `identity/keys.ts` | Local key generation and peer ID management — Ed25519 keypair, `peer_id`, `key_fingerprint` |
| `types/agentpod.d.ts` | Shared AgentPod types (see below) |

### What `plugin/` should not contain

- OpenAgents event names or raw OpenAgents types exposed outside `client.ts`
- HTTP server logic that belongs in `hub/`
- Hardcoded network topology

### `types/agentpod.d.ts`

This file is the shared contract for the whole repo.

It defines AgentPod's public data model:

- `PeerProfile`
- `CapabilityManifest`
- `ServiceSpec`
- `TaskRequest`
- `TaskUpdate`
- `TaskResult`
- `ArtifactRef`
- `NetworkProfile` (the `managed` and `private` variants)
- `PublicCard`
- policy types (`OwnerPolicy`, `ServicePolicy`, `RequestPolicy`, `EffectivePolicy`)

Both `plugin/` and `hub/` import from `plugin/types/agentpod.d.ts`.

This is intentional: the plugin is the reference implementation. The hub is a thin server that operates on the same types.

If shared types grow large enough to warrant a separate package later, extract then — not now.

## `hub/`

This folder is the server component. It should stay thin.

It is not a second protocol stack.

```text
hub/
├─ package.json
├─ tsconfig.json
├─ index.ts
├─ config/
│  └─ schema.ts
├─ join/
│  ├─ manifest.ts
│  ├─ token-issuer.ts
│  ├─ token-renew.ts
│  └─ revocation.ts
├─ projection/
│  ├─ public-card.ts
│  ├─ visibility-filter.ts
│  └─ verification-badges.ts
├─ operator-api/
│  └─ routes.ts
├─ openagents/
│  └─ wiring.ts
└─ test/
```

### Hub file responsibilities

| File / folder | Owns |
| --- | --- |
| `index.ts` | Hub entrypoint — starts HTTP server, wires routes and services |
| `config/schema.ts` | Hub config schema and parser |
| `join/manifest.ts` | Managed join manifest hosting — serves the signed manifest at `GET /v1/networks/:networkId/join-manifest` |
| `join/token-issuer.ts` | Join token issuing — `POST /v1/join/exchange`; validates proof of possession and mints a short-lived bearer token |
| `join/token-renew.ts` | Token renewal — `POST /v1/tokens/renew`; issues a new token for the same peer identity |
| `join/revocation.ts` | Revocation — `POST /v1/tokens/revoke`; blocks a peer by `peer_id` or `key_fingerprint` |
| `projection/public-card.ts` | Public card projection — reads sanitized `PublicCard` from OpenAgents discovery state |
| `projection/visibility-filter.ts` | Visibility filter — enforces `public`, `network_only`, and `private` card visibility rules |
| `projection/verification-badges.ts` | Verification badge logic — marks cards as verified when the operator path and signature are both valid |
| `operator-api/routes.ts` | Operator-facing HTTP endpoints — `GET/POST /v1/public-cards`, `POST /v1/public-cards/:peerId/withdraw` |
| `openagents/wiring.ts` | OpenAgents wiring — connects the hub to OpenAgents discovery, delegation, and shared artifact modules; the only place in `hub/` that knows OpenAgents internals |

### What `hub/` should not contain

- OpenClaw plugin SDK imports
- Plugin runtime logic
- A reimplementation of discovery, delivery, or artifact storage from scratch
- Sub-folders named `mailbox/`, `presence/`, `directory/`, or `delivery-protocol/` — those names encourage reimplementing the substrate

### OpenAgents wiring

The hub wires OpenAgents-backed components inside `openagents/wiring.ts`.

Everything OpenAgents-specific is confined to that one file.

If OpenAgents is replaced later, `openagents/wiring.ts` is the primary rewrite surface inside `hub/`.

## Root workspace files

```text
agentpod/
├─ package.json          ← pnpm workspace root
├─ pnpm-workspace.yaml   ← declares plugin/ and hub/ as workspace packages
├─ tsconfig.json         ← shared compiler base
└─ vitest.config.ts      ← shared test runner config
```

Both `plugin/` and `hub/` are pnpm workspace packages with their own `package.json` and `tsconfig.json`.

The root `package.json` and `vitest.config.ts` cover workspace-wide dev, test, and typecheck commands.

## `scripts/`

```text
scripts/
├─ dev-openclaw-link.sh          ← links plugin/ into a local OpenClaw checkout for dev testing
├─ dev-openagents-config.md      ← notes for running against the local OpenAgents server
├─ dev-public-directory.md       ← runbook: managed public join by URL
└─ dev-private-hub.md            ← runbook: separate self-hosted private hub
```

## `test/integration/`

```text
test/integration/
├─ agentpod-openclaw.integration.test.ts
└─ fixtures/
   ├─ fake-substrate-server.ts   ← fake WebSocket substrate (task delegation + mailbox)
   ├─ fake-directory-server.ts   ← fake peer directory (publication + public-card projection)
   └─ fake-mailbox-server.ts     ← fake mailbox hub (offline peer delivery)
```

Integration tests cover the full end-to-end happy path:

- plugin starts and joins via an outbound-only profile
- peer list loads from the fake substrate
- delegation returns a task handle
- task updates and final result are reflected locally
- public-card publication sends only sanitized fields
- offline mailbox delivery works for an outbound-only peer
- duplicate inbound task replay does not execute the same task twice
- only one active network profile is allowed at a time

## `examples/`

```text
examples/
├─ managed-public/        ← example OpenClaw config for joining the managed public network
├─ self-hosted-private/   ← example config for a private VPC or tailnet setup
└─ private-minimal/       ← smallest example config for a private self-hosted hub
```

Examples contain only config and README files — no additional runtime code.

## `docs/AGENTPOD.md.template`

The `AGENTPOD.md` capability source document is owner-authored, not repo-authored.

A template lives in `docs/AGENTPOD.md.template` for reference.

Minimal required sections:

```text
# Summary

One-paragraph description of what this agent is good at.

# Services

## service_id
- summary:
- when to use:

# Inputs
- accepted payload types:
- accepted attachment types:

# Outputs
- result types:
- artifact behavior:

# Safety
- notable limits:
```

Service id rules (enforced by `source-doc/validator.ts`):

- must match `^[a-z0-9][a-z0-9_-]{1,63}$`
- must be unique within one source document
- compile failure blocks publication

`AGENTPOD.md` is primarily descriptive.
It explains what services exist, when to use them, and the default IO/result shape they expect.
If the document includes safety or tool-use notes, treat them as optional published defaults only.
The actual execution policy still comes from local owner configuration and runtime guard logic.

## Dependency direction

```text
plugin/types/agentpod.d.ts   (shared contract, no runtime deps)
        ↑                ↑
   plugin/           hub/
```

Rules:

- `plugin/types/agentpod.d.ts` depends on nothing runtime-specific
- `plugin/` may depend on `plugin/types/`
- `hub/` may depend on `plugin/types/` via a relative import or shared package reference
- `hub/` must not import from `plugin/` outside of `plugin/types/`
- `plugin/` must not import from `hub/`

## How protocol definition should work

There is no giant wire-spec document.

Protocol definition is split into two surfaces.

### Data model

Defined in `plugin/types/agentpod.d.ts`.

This is AgentPod's own language:

- peer identity
- capability manifests
- task requests and results
- artifact refs
- public card projections
- local network profiles

### Substrate mapping

Defined inside `plugin/client.ts` and `hub/openagents/wiring.ts`.

This answers:

- which OpenAgents events are called
- how AgentPod types map onto OpenAgents types
- how artifacts are translated without leaking OpenAgents types outward

This is not a new public protocol.
It is an internal compatibility layer.

## Why this structure is open-source friendly

A contributor can open the repo and immediately see two folders.

- Want to add a new tool? Open `plugin/tools/`.
- Want to add a slash command? Open `plugin/commands/slash.ts`.
- Want to change how peers are cached? Open `plugin/service/peer-cache.ts`.
- Want to change how the AGENTPOD.md compiles? Open `plugin/source-doc/compiler.ts`.
- Want to change execution policy? Open `plugin/policy/guard.ts`.
- Want to change how tokens are issued? Open `hub/join/token-issuer.ts`.
- Want to change the public card projection? Open `hub/projection/public-card.ts`.
- Want to change OpenAgents wiring? Open `hub/openagents/wiring.ts`.

There is no package graph to trace, no workspace to boot, no internal dependency to rebuild.

Contributor examples:

| Contributor | Works in |
| --- | --- |
| Plugin tool contributor | `plugin/tools/` |
| Commands contributor | `plugin/commands/` |
| Background service contributor | `plugin/service/` |
| AGENTPOD.md compiler contributor | `plugin/source-doc/` |
| Policy / execution safety contributor | `plugin/policy/` and `plugin/tasks/` |
| Shared types / schema contributor | `plugin/types/agentpod.d.ts` |
| Hub operator contributor | `hub/operator-api/` |
| Join / token contributor | `hub/join/` |
| Public card contributor | `hub/projection/` |
| OpenAgents adapter contributor | `hub/openagents/wiring.ts` |
| Integration test contributor | `test/integration/` |

## Testing strategy

### `plugin/test/`

Test:

- tool behavior (`peers`, `delegate`, `join`, `tasks`)
- commands and CLI registration
- Gateway RPC method responses
- config parsing and profile resolution (managed / private)
- peer cache reads and writes
- session hook injection
- source-doc compilation success and failure
- service id validation
- policy merge (`owner ∩ service ∩ request`)
- task deduplication by `task_id`
- identity key generation

### `hub/test/`

Test:

- join manifest generation
- token issuing and renewal
- revocation blocks renewal and hides public cards
- public card projection output
- visibility filter (public / network_only / private)
- verification badge logic
- operator-api route behavior

### `test/integration/`

Test:

- full end-to-end happy path using fake substrate, directory, and mailbox fixtures
- outbound-only peer delivery (offline peer mailbox replay)
- duplicate inbound task deduplication
- single active network profile enforcement

Keep test files inside `test/` subdirectories, not scattered as `*.test.ts` files at the root of plugin or hub.

## What not to add yet

Do not add these until they are truly needed:

- separate `agentpod-contract` package
- separate `agentpod-source-doc` package
- separate `agentpod-openagents-adapter` package
- separate `agentpod-website` app
- separate `agentpod-console` app
- `src/` nesting inside `plugin/` or `hub/`
- `mailbox/`, `presence/`, `directory/`, or `delivery-protocol/` folders inside `hub/`

If a file has only one concern and fits in an existing subfolder, put it there.
Only create a new subfolder when there are at least two files that share a clear boundary.
