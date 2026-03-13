# AgentPod Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build AgentPod as an OpenClaw-compatible plugin plus a thin OpenAgents-backed hub layer, with explicit install/join flows for managed public and self-hosted private networks.

**Architecture:** The repo stays flat and easy to read. Runtime code lives only in `plugin/` and `hub/`. OpenAgents is the actual v0.1 substrate behind a narrow adapter boundary. `AGENTPOD.md` describes published capabilities; local owner configuration remains authoritative for runtime policy.

**Tech Stack:** TypeScript, Node 22+, pnpm workspace, Vitest, JSON Schema/TypeBox or Zod, OpenClaw plugin packaging conventions, OpenAgents-backed transport adapters, WebSocket/HTTPS hub endpoints.

---

## Pre-Implementation Checklist

The implementation must preserve these accepted v0.1 decisions:

- identity/auth/trust uses `signed join manifest + local peer keypair + signed capability manifest`
- service publication carries `peer_id`, public-key fingerprint, `issued_at`, `expires_at`, and signature
- website `verified` only means operator-verified publication path
- delivery is `at-most-once`; do not add retry/exactly-once guarantees in v0.1
- the receiver dedupes by `task_id`
- OpenAgents is the only substrate in v0.1
- `agentpod-hub` stays thin and must not grow a second protocol stack
- `AGENTPOD.md` is the local source document for published services
- `AGENTPOD.md` is descriptive, not the final authority for runtime policy
- default source-document refresh is generate once with no auto-refresh
- optional refresh modes are `manual`, `weekly`, and `monthly`
- remote execution uses a dedicated spawned task session
- only explicit `payload + attachments` may cross the network boundary
- discovery is metadata-load-only
- artifact handling is `small inline + large relay-backed`
- OpenClaw plugin CLI registrar is part of the v0.1 scope
- only one active network is supported in v0.1
- only `managed public` and `private` join modes are in scope
- advanced profiles are deferred
- embedded-host mode is deferred

## Narrative Flow This Plan Must Implement

The implementation must make the following story real:

1. A user installs the AgentPod plugin into OpenClaw and enables it.
2. The plugin remains idle until the owner configures and joins a network profile.
3. The profile may be:
   - `managed` via `join_url`
   - `private` via `base_url`
4. The plugin connects outbound to the configured hub or OpenAgents-backed substrate.
5. If allowed, the plugin publishes a sanitized `CapabilityManifest` compiled from local `AGENTPOD.md`.
6. Peer discovery is directory-backed and locally cached.
7. The local agent reads peers via `agentpod_peers` and delegates with `agentpod_delegate`.
8. The target peer receives the task through the hub's long-lived outbound connection or mailbox delivery.
9. The remote plugin applies local policy, executes in a dedicated spawned task session, and reports progress/results.
10. The origin OpenClaw session receives translated progress and final output.
11. Public website cards are rendered from the sanitized published directory projection, not by scraping OpenClaw instances directly.

This narrative must hold for:

- hosted public network usage
- separate self-hosted private hub usage
- OpenClaw hosts on a Mac mini
- OpenClaw hosts inside a VPC
- outbound-only connectivity

The implementation must preserve these truths:

- a directory alone is not enough
- the hub/substrate must support presence, long-lived outbound connections, push delivery, and mailbox buffering
- OpenAgents stays behind the adapter boundary and does not become the public AgentPod contract
- v0.1 supports only one active network profile
- v0.1 delivery is at-most-once and optimized to avoid duplicate execution, not message loss
- v0.1 discovery is metadata load, not search
- v0.1 does not define a crash-safe delivery state machine

### Task 0: Keep the docs aligned with the simplified v0.1 scope

**Files:**
- Modify: `docs/architecture-details.md`
- Modify: `docs/joins.md`
- Modify: `docs/protocol-v0.1.md`
- Modify: `docs/repo-structure.md`
- Modify: `docs/plans/2026-03-12-agentpod-design.md`
- Modify: `docs/plans/2026-03-12-agentpod-validation.md`
- Modify: `docs/plans/2026-03-12-agentpod-operator-hub-addendum.md`
- Modify: `docs/plans/2026-03-12-agentpod-operator-endpoints-auth.md`

**Step 1: Record the simplifications**

Capture:

- flat workspace with `plugin/` and `hub/` only
- public managed join + simple private join only
- `AGENTPOD.md` as capability description, not final runtime policy
- simple at-most-once semantics with no crash-safe state-machine work
- no advanced profiles
- no embedded-host mode in the first implementation

**Step 2: Read the docs together and verify consistency**

Check:

- no doc still points to `packages/*`
- no doc still requires `advanced`
- no doc still treats embedded-host as in-scope
- no doc still claims `AGENTPOD.md` controls runtime policy

**Step 3: Commit**

```bash
git add docs
git commit -m "docs: simplify AgentPod v0.1 scope"
```

### Task 1: Scaffold the flat workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `plugin/package.json`
- Create: `plugin/tsconfig.json`
- Create: `plugin/openclaw.plugin.json`
- Create: `plugin/index.ts`
- Create: `hub/package.json`
- Create: `hub/tsconfig.json`
- Create: `hub/index.ts`
- Create: `plugin/test/workspace.test.ts`
- Create: `hub/test/workspace.test.ts`

**Step 1: Write the failing smoke tests**

Test:

- plugin workspace exports a marker
- hub workspace exports a marker

**Step 2: Run tests to verify they fail**

Run:

- `pnpm vitest plugin/test/workspace.test.ts`
- `pnpm vitest hub/test/workspace.test.ts`

Expected: FAIL because the flat workspace files do not exist yet.

**Step 3: Add minimal scaffolding**

Create:

- one root workspace
- one `plugin/` package
- one `hub/` package
- no extra runtime package folders

**Step 4: Run tests to verify they pass**

Run:

- `pnpm vitest plugin/test/workspace.test.ts`
- `pnpm vitest hub/test/workspace.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.json vitest.config.ts plugin hub
git commit -m "chore: scaffold flat AgentPod workspace"
```

### Task 2: Define shared AgentPod types inside `plugin/types/`

**Files:**
- Create: `plugin/types/agentpod.d.ts`
- Create: `plugin/test/types.test.ts`

**Step 1: Write the failing type-shape tests**

Cover:

- `PeerProfile`
- `CapabilityManifest`
- `ServiceSpec`
- `TaskRequest`
- `TaskUpdate`
- `TaskResult`
- `PublicCard`
- `ManagedNetworkProfile`
- `PrivateNetworkProfile`

**Step 2: Run tests to verify they fail**

Run:

- `pnpm vitest plugin/test/types.test.ts`

Expected: FAIL because shared types are missing.

**Step 3: Add the minimal shared contract**

Rules:

- keep OpenAgents names out of the public contract
- include only `managed` and `private` network-profile variants
- keep policy fields typed, but do not make markdown the authority for runtime policy

**Step 4: Run tests to verify they pass**

Run:

- `pnpm vitest plugin/test/types.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add plugin/types/agentpod.d.ts plugin/test/types.test.ts
git commit -m "feat: add shared AgentPod contract types"
```

### Task 3: Build `AGENTPOD.md` parsing and validation in `plugin/source-doc/`

**Files:**
- Create: `plugin/source-doc/compiler.ts`
- Create: `plugin/source-doc/validator.ts`
- Create: `plugin/test/source-doc.test.ts`

**Step 1: Write the failing source-doc tests**

Cover:

- minimal valid `AGENTPOD.md`
- duplicate service ids fail
- invalid service ids fail
- missing required sections fail
- optional safety/tool-use notes are treated as defaults only

**Step 2: Run tests to verify they fail**

Run:

- `pnpm vitest plugin/test/source-doc.test.ts`

Expected: FAIL because parser/compiler code is missing.

**Step 3: Implement the minimal compiler**

Rules:

- compile `AGENTPOD.md` into `CapabilityManifest`
- keep the markdown format descriptive
- allow default policy hints, but do not treat them as final runtime policy
- block publication on compile failure

**Step 4: Run tests to verify they pass**

Run:

- `pnpm vitest plugin/test/source-doc.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add plugin/source-doc plugin/test/source-doc.test.ts
git commit -m "feat: add AGENTPOD source-doc compiler"
```

### Task 4: Add the OpenAgents adapter boundary in `plugin/client.ts`

**Files:**
- Create: `plugin/client.ts`
- Create: `plugin/test/client.test.ts`

**Step 1: Write the failing adapter tests**

Cover:

- publish manifest maps to OpenAgents-backed publication
- list peers returns AgentPod-shaped data
- delegate maps `TaskRequest` onto substrate calls
- task updates/results map back into AgentPod-shaped objects
- OpenAgents-specific payloads do not leak outward

**Step 2: Run tests to verify they fail**

Run:

- `pnpm vitest plugin/test/client.test.ts`

Expected: FAIL because adapter code is missing.

**Step 3: Implement the narrow adapter**

Expose:

- `publishManifest()`
- `listPeers()`
- `delegate()`
- `subscribeTask()`

Keep all OpenAgents wiring internal to this file and `hub/openagents/wiring.ts`.

**Step 4: Run tests to verify they pass**

Run:

- `pnpm vitest plugin/test/client.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add plugin/client.ts plugin/test/client.test.ts
git commit -m "feat: add OpenAgents adapter boundary"
```

### Task 5: Build the thin hub for managed join and public-card projection

**Files:**
- Create: `hub/config/schema.ts`
- Create: `hub/join/manifest.ts`
- Create: `hub/join/token-issuer.ts`
- Create: `hub/join/token-renew.ts`
- Create: `hub/join/revocation.ts`
- Create: `hub/projection/public-card.ts`
- Create: `hub/projection/visibility-filter.ts`
- Create: `hub/projection/verification-badges.ts`
- Create: `hub/operator-api/routes.ts`
- Create: `hub/openagents/wiring.ts`
- Create: `hub/test/server.test.ts`

**Step 1: Write the failing hub tests**

Cover:

- managed join manifest endpoint returns signed manifest metadata
- token exchange and renew route through the hub join layer
- public card projection reads sanitized data from OpenAgents-backed discovery state
- revocation hides withdrawn public cards from the public-card API
- private mode can skip managed join endpoints and still use projection surfaces

**Step 2: Run tests to verify they fail**

Run:

- `pnpm vitest hub/test/server.test.ts`

Expected: FAIL.

**Step 3: Implement the minimal hub**

Implement:

- join-manifest hosting for the public network
- token issuing / renewal / revocation for the public network
- public-card projection
- operator-facing endpoints
- no separate delivery protocol

**Step 4: Run tests to verify they pass**

Run:

- `pnpm vitest hub/test/server.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add hub
git commit -m "feat: add thin AgentPod hub"
```

### Task 6: Add plugin state, profile resolution, and background service shell

**Files:**
- Create: `plugin/config.ts`
- Create: `plugin/state/store.ts`
- Create: `plugin/service/background.ts`
- Create: `plugin/service/peer-cache.ts`
- Create: `plugin/service/substrate-sync.ts`
- Create: `plugin/identity/keys.ts`
- Create: `plugin/test/profile.test.ts`
- Create: `plugin/test/service.test.ts`

**Step 1: Write the failing service tests**

Cover:

- plugin service starts and stops cleanly
- persisted task and peer state loads
- `managed` profiles resolve via `join_url`
- `private` profiles resolve via `base_url`
- only one active profile is allowed

**Step 2: Run tests to verify they fail**

Run:

- `pnpm vitest plugin/test/profile.test.ts plugin/test/service.test.ts`

Expected: FAIL.

**Step 3: Implement minimal state and service behavior**

Create:

- file-backed local store for `network`, `directory`, and `task` state
- background service shell with start/stop hooks
- join-manifest resolution logic for `managed`
- `base_url` derivation for `private`
- local key generation

**Step 4: Run tests to verify they pass**

Run:

- `pnpm vitest plugin/test/profile.test.ts plugin/test/service.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add plugin/config.ts plugin/state plugin/service plugin/identity plugin/test/profile.test.ts plugin/test/service.test.ts
git commit -m "feat: add plugin state and profile resolution"
```

### Task 7: Add owner-facing commands, CLI, and Gateway RPC

**Files:**
- Create: `plugin/commands/slash.ts`
- Create: `plugin/commands/cli.ts`
- Create: `plugin/commands/gateway.ts`
- Create: `plugin/test/commands.test.ts`
- Create: `plugin/test/gateway.test.ts`

**Step 1: Write the failing command tests**

Cover:

- `/agentpod join`
- `/agentpod leave`
- `/agentpod peers`
- `/agentpod tasks`
- `openclaw agentpod join`
- `agentpod.status`
- `agentpod.peers.list`
- `agentpod.tasks.list`
- `agentpod.network.join`
- `agentpod.network.leave`

**Step 2: Run tests to verify they fail**

Run:

- `pnpm vitest plugin/test/commands.test.ts plugin/test/gateway.test.ts`

Expected: FAIL.

**Step 3: Implement deterministic command handlers**

Rules:

- forward into the background service
- keep outputs AgentPod-shaped
- expose only `managed` and `private` join flows

**Step 4: Run tests to verify they pass**

Run:

- `pnpm vitest plugin/test/commands.test.ts plugin/test/gateway.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add plugin/commands plugin/test/commands.test.ts plugin/test/gateway.test.ts
git commit -m "feat: add AgentPod join flows and commands"
```

### Task 8: Add agent-facing tools and guarded execution

**Files:**
- Create: `plugin/tools/peers.ts`
- Create: `plugin/tools/delegate.ts`
- Create: `plugin/tools/tasks.ts`
- Create: `plugin/policy/guard.ts`
- Create: `plugin/tasks/runner.ts`
- Create: `plugin/tasks/registry.ts`
- Create: `plugin/artifacts/bridge.ts`
- Create: `plugin/test/tools.test.ts`
- Create: `plugin/test/guard.test.ts`
- Create: `plugin/test/task-runner.test.ts`

**Step 1: Write the failing tool and execution tests**

Cover:

- `agentpod_peers` returns cached metadata without search/ranking
- `agentpod_delegate` returns quickly with a task handle
- `agentpod_tasks` returns local task statuses
- duplicate inbound `task_id` is not executed twice
- accepted inbound work creates a dedicated spawned task session
- artifact policy enforces inline-vs-relay handling

**Step 2: Run tests to verify they fail**

Run:

- `pnpm vitest plugin/test/tools.test.ts plugin/test/guard.test.ts plugin/test/task-runner.test.ts`

Expected: FAIL.

**Step 3: Implement minimal guarded execution**

Rules:

- use local owner config as the runtime policy authority
- let published service policy act only as a default/provider hint
- keep at-most-once implementation simple
- do not add crash-recovery state-machine complexity

**Step 4: Run tests to verify they pass**

Run:

- `pnpm vitest plugin/test/tools.test.ts plugin/test/guard.test.ts plugin/test/task-runner.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add plugin/tools plugin/policy plugin/tasks plugin/artifacts plugin/test/tools.test.ts plugin/test/guard.test.ts plugin/test/task-runner.test.ts
git commit -m "feat: add delegation tools and guarded execution"
```

### Task 9: Add public-card sync and local ingress helpers

**Files:**
- Create: `plugin/http/routes.ts`
- Create: `plugin/test/http.test.ts`
- Create: `plugin/test/substrate-sync.test.ts`

**Step 1: Write the failing sync tests**

Cover:

- authenticated plugin-owned routes for artifact bridge behavior
- public-card publication uses sanitized manifest data
- peer cache refresh happens after join or reconnect
- remote tasks still arrive through substrate delivery, not a new inbound HTTP requirement

**Step 2: Run tests to verify they fail**

Run:

- `pnpm vitest plugin/test/http.test.ts plugin/test/substrate-sync.test.ts`

Expected: FAIL.

**Step 3: Implement route and sync handlers**

Rules:

- use HTTP routes only for plugin-owned local ingress needs
- keep remote task delivery on the outbound substrate connection
- publish compiled `AGENTPOD.md` output rather than raw source markdown

**Step 4: Run tests to verify they pass**

Run:

- `pnpm vitest plugin/test/http.test.ts plugin/test/substrate-sync.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add plugin/http plugin/test/http.test.ts plugin/test/substrate-sync.test.ts
git commit -m "feat: add public-card sync and local ingress helpers"
```

### Task 10: Add local dev harness and integration coverage

**Files:**
- Create: `scripts/dev-openclaw-link.sh`
- Create: `scripts/dev-openagents-config.md`
- Create: `scripts/dev-public-directory.md`
- Create: `scripts/dev-private-hub.md`
- Create: `test/integration/agentpod-openclaw.integration.test.ts`
- Create: `test/integration/fixtures/fake-substrate-server.ts`
- Create: `test/integration/fixtures/fake-directory-server.ts`
- Create: `test/integration/fixtures/fake-mailbox-server.ts`
- Modify: `README.md`

**Step 1: Write the failing integration test**

Test the end-to-end happy path:

- plugin starts
- managed public join works
- private join via `base_url` works
- peer list is available from fake substrate
- delegation returns a handle
- task update and result are reflected locally
- public-card publication sends only sanitized fields
- offline mailbox delivery works for an outbound-only peer
- duplicate inbound task replay does not execute the same task twice
- only one active network profile is allowed

**Step 2: Run test to verify it fails**

Run:

- `pnpm vitest test/integration/agentpod-openclaw.integration.test.ts`

Expected: FAIL.

**Step 3: Implement harness and docs**

Add:

- a fake substrate server for deterministic integration tests
- a fake directory server for public-card verification
- a fake mailbox-capable hub server for outbound-only delivery verification
- linking instructions for local OpenClaw testing
- runbooks for managed public join and private self-hosted hub usage

**Step 4: Run integration tests to verify they pass**

Run:

- `pnpm vitest test/integration/agentpod-openclaw.integration.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts test README.md
git commit -m "test: add AgentPod integration harness"
```

### Task 11: Verify the flat workspace and prepare the first milestone

**Files:**
- Modify: `README.md`
- Modify: `docs/joins.md`
- Modify: `docs/architecture-details.md`
- Modify: `docs/plans/2026-03-12-agentpod-design.md`
- Modify: `docs/plans/2026-03-12-agentpod-implementation.md`

**Step 1: Run the full test suite**

Run:

- `pnpm vitest`

Expected: PASS for all plugin, hub, and integration tests.

**Step 2: Run packaging and typecheck verification**

Run:

- `pnpm -r exec tsc --noEmit`

Expected: PASS with no type errors.

**Step 3: Refresh milestone docs**

Note:

- the workspace is intentionally flat
- runtime code lives in `plugin/` and `hub/`
- no `packages/*` split is used in v0.1
- OpenAgents is the default substrate behind a narrow boundary
- network join is explicit and owner-controlled
- only public managed and private self-hosted joins are in scope
- public website cards are sanitized directory projections
- v0.1 supports a single active network only
- v0.1 discovery loads metadata and lets the local agent choose
- v0.1 delivery is at-most-once and prioritizes avoiding duplicate execution
- published services come from local `AGENTPOD.md`
- `AGENTPOD.md` is descriptive rather than the final runtime policy source
- remote execution uses dedicated spawned task sessions

**Step 4: Re-run verification**

Run:

- `pnpm vitest`
- `pnpm -r exec tsc --noEmit`

Expected: PASS again after doc and config updates.

**Step 5: Commit**

```bash
git add README.md docs
git commit -m "docs: finalize simplified AgentPod MVP plan"
```
