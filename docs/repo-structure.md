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

- a small number of packages
- clear dependency direction
- contract-first boundaries
- runtime-specific code kept at the edges
- simple local testing

It should avoid:

- too many micro-packages
- multiple ways to express the same concept
- mixing OpenClaw-specific code with protocol models
- mixing OpenAgents-specific code with AgentPod public types

## Recommended top-level layout

```text
agentpod/
├─ README.md
├─ docs/
│  ├─ joins.md
│  ├─ architecture-details.md
│  ├─ repo-structure.md
│  └─ plans/
├─ packages/
│  ├─ agentpod-contract/
│  ├─ agentpod-source-doc/
│  ├─ agentpod-openagents-adapter/
│  ├─ agentpod-openclaw-plugin/
│  └─ agentpod-hub/
├─ examples/
│  ├─ managed-public/
│  ├─ self-hosted-private/
│  └─ embedded-host/
└─ scripts/
```

This is intentionally smaller than a "full platform" layout.

For v0.1, do not create separate apps for website, operator console, admin dashboard, or developer playground unless they are immediately needed.

## Package responsibilities

### `packages/agentpod-contract`

This package defines AgentPod's public data model.

It should contain:

- `PeerProfile`
- `CapabilityManifest`
- `ServiceSpec`
- `TaskRequest`
- `TaskUpdate`
- `TaskResult`
- `ArtifactRef`
- `NetworkProfile`
- `PublicCard`
- policy merge utilities
- validation schemas

It should not contain:

- OpenClaw imports
- OpenAgents event names
- HTTP servers
- plugin runtime logic

This package is the stable core.

### `packages/agentpod-source-doc`

This package owns `AGENTPOD.md`.

It should contain:

- markdown parser
- compiler from `AGENTPOD.md` to `CapabilityManifest`
- validation rules
- service id generation and validation
- source-document templates

It should not know:

- how manifests are published
- how tasks are delegated
- how OpenClaw runs sessions

This keeps "human-authored capability description" separate from runtime logic.

### `packages/agentpod-openagents-adapter`

This package is the only place that should know OpenAgents details.

It should map:

- AgentPod peer publication -> OpenAgents discovery
- AgentPod task lifecycle -> OpenAgents task delegation
- AgentPod relay-backed artifacts -> OpenAgents shared artifact

It should contain:

- mapping functions
- adapter client
- transport wrappers
- OpenAgents-specific integration tests

It should not define a second protocol.

If OpenAgents is replaced later, this should be the main rewrite surface.

### `packages/agentpod-openclaw-plugin`

This is the actual plugin users install into OpenClaw.

It should contain:

- plugin entrypoint
- config schema
- background service
- peer cache
- task registry
- tools
- commands
- CLI registration
- Gateway methods
- HTTP routes
- identity/key management
- spawned task session execution
- artifact policy bridge

This package is where local runtime and safety live.

It should not expose raw OpenAgents types to the rest of the repo.

### `packages/agentpod-hub`

This package should stay thin.

It is not a second protocol stack.

It should contain:

- managed join manifest hosting
- join token issuing and renewal
- revocation handling
- public card projection
- operator-facing endpoints
- embedded-host bootstrap

It may internally wire OpenAgents-backed components together, but it should not reimplement discovery, delivery, or artifact storage from scratch.

## Recommended internal structure

### `agentpod-contract`

```text
packages/agentpod-contract/
├─ src/
│  ├─ index.ts
│  ├─ version.ts
│  ├─ peer.ts
│  ├─ manifest.ts
│  ├─ task.ts
│  ├─ artifact.ts
│  ├─ network-profile.ts
│  ├─ public-card.ts
│  ├─ identity.ts
│  ├─ policy.ts
│  └─ schemas/
└─ test/
```

### `agentpod-source-doc`

```text
packages/agentpod-source-doc/
├─ src/
│  ├─ index.ts
│  ├─ parser.ts
│  ├─ compiler.ts
│  ├─ validator.ts
│  ├─ service-id.ts
│  └─ templates/
└─ test/
```

### `agentpod-openagents-adapter`

```text
packages/agentpod-openagents-adapter/
├─ src/
│  ├─ index.ts
│  ├─ discovery/
│  ├─ delegation/
│  ├─ artifacts/
│  ├─ identity/
│  └─ transport/
└─ test/
```

### `agentpod-openclaw-plugin`

```text
packages/agentpod-openclaw-plugin/
├─ openclaw.plugin.json
├─ index.ts
├─ src/
│  ├─ config/
│  ├─ service/
│  ├─ tools/
│  ├─ commands/
│  ├─ cli/
│  ├─ gateway/
│  ├─ http/
│  ├─ execution/
│  ├─ identity/
│  ├─ source-doc/
│  └─ artifacts/
└─ test/
```

### `agentpod-hub`

```text
packages/agentpod-hub/
├─ src/
│  ├─ index.ts
│  ├─ config/
│  ├─ join/
│  ├─ projection/
│  ├─ operator-api/
│  ├─ embedded/
│  └─ openagents/
└─ test/
```

## Dependency direction

The dependency direction should stay simple:

```text
agentpod-contract
  ↑
agentpod-source-doc
  ↑
agentpod-openagents-adapter
  ↑
agentpod-openclaw-plugin

agentpod-contract
  ↑
agentpod-openagents-adapter
  ↑
agentpod-hub
```

Rules:

- `agentpod-contract` depends on nothing runtime-specific
- `agentpod-source-doc` may depend on `agentpod-contract`
- `agentpod-openagents-adapter` may depend on `agentpod-contract`
- `agentpod-openclaw-plugin` may depend on `contract`, `source-doc`, and `adapter`
- `agentpod-hub` may depend on `contract` and `adapter`
- `agentpod-hub` must not depend on `agentpod-openclaw-plugin`

This keeps the runtime edges replaceable.

## How protocol definition should work

For this project, "protocol" should not mean one giant wire-spec document.

It is better to split protocol definition into three layers.

### 1. Product contract

Defined in `agentpod-contract`.

This is AgentPod's own language:

- peer identity
- capability manifests
- task requests and results
- artifact refs
- public card projections
- local network profiles

This is what the plugin, hub, and future runtimes share.

### 2. Source document contract

Defined in `agentpod-source-doc`.

This answers:

- what `AGENTPOD.md` must contain
- how services get stable ids
- when compilation fails
- how owner edits are validated

This is the human-editable capability surface.

### 3. Substrate mapping contract

Defined in `agentpod-openagents-adapter`.

This answers:

- which OpenAgents mods are used
- which OpenAgents events are called
- how AgentPod types map onto OpenAgents types
- how artifacts are translated without leaking OpenAgents types outward

This is not a new public protocol.
It is an internal compatibility layer.

## Why this structure is open-source friendly

This layout helps contributors because:

- they can work on the contract layer without understanding OpenClaw internals
- they can work on the plugin without understanding all OpenAgents details
- they can work on the hub without changing plugin runtime logic
- test scope stays local to each package

Examples:

- schema contributor: works in `agentpod-contract`
- markdown/compiler contributor: works in `agentpod-source-doc`
- OpenAgents integration contributor: works in `agentpod-openagents-adapter`
- OpenClaw integration contributor: works in `agentpod-openclaw-plugin`
- operator/deployment contributor: works in `agentpod-hub`

## Testing strategy by package

Each package should have its own smallest useful test surface.

### `agentpod-contract`

Test:

- schema parsing
- policy merge
- type invariants

### `agentpod-source-doc`

Test:

- parsing
- compile success
- compile failure
- service id validation

### `agentpod-openagents-adapter`

Test:

- mapping correctness
- event translation
- artifact translation
- real OpenAgents integration coverage where practical

### `agentpod-openclaw-plugin`

Test:

- tool behavior
- commands and CLI registration
- profile loading
- spawned task session integration
- policy enforcement
- artifact policy

### `agentpod-hub`

Test:

- join manifest generation
- token issuing and renewal
- revocation
- public card projection
- embedded-host bootstrap

## What not to add yet

To keep the project simple, do not add these until they are truly needed:

- separate `agentpod-website` app
- separate `agentpod-console` app
- multi-runtime plugin packages
- multiple contract packages
- separate crypto package
- separate artifact-service package
- separate discovery-service package

If a folder or package has only one file and no clear boundary yet, keep it inside the nearest existing package.

## Practical v0.1 recommendation

If starting implementation now, create only these packages:

- `agentpod-contract`
- `agentpod-source-doc`
- `agentpod-openagents-adapter`
- `agentpod-openclaw-plugin`
- `agentpod-hub`

That is enough for:

- protocol/data definitions
- `AGENTPOD.md`
- OpenAgents reuse
- OpenClaw plugin runtime
- managed/private/embedded hosting support

This is the smallest structure that still keeps the architecture clean.
