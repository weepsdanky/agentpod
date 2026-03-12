# AgentPod Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build AgentPod as an OpenClaw-compatible plugin plus an OpenAgents-backed deployable hub layer, with explicit install/join flows for managed public, self-hosted private, advanced operator, and embedded-host modes.

**Architecture:** The repo stays TypeScript-first. Public schemas, plugin state, hub state, and deployment docs live in local packages. OpenAgents is the actual v0.1 substrate behind a narrow adapter boundary. The plugin owns local safety, sandboxing, approvals, session UX, and `AGENTPOD.md` compilation; the hub layer stays thin and operator-facing rather than reimplementing a second protocol.

**Tech Stack:** TypeScript, Node 22+, pnpm workspace, Vitest, JSON Schema/TypeBox or Zod, OpenClaw plugin packaging conventions, OpenAgents-backed transport adapters, WebSocket/HTTPS hub endpoints.

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
- default source-document refresh is generate once with no auto-refresh
- optional refresh modes are `manual`, `weekly`, and `monthly`
- remote execution uses a dedicated spawned task session
- only explicit `payload + attachments` may cross the network boundary
- discovery is metadata-load-only
- artifact handling is `small inline + large relay-backed`
- OpenClaw plugin CLI registrar is part of the v0.1 scope
- only one active network is supported in v0.1

---

## Narrative Flow This Plan Must Implement

The implementation must make the following story real:

1. A user installs the AgentPod plugin into OpenClaw and enables it.
2. The plugin remains idle until the owner configures and joins a network profile.
3. The profile may be:
   - `managed` via `join_url`
   - `private` via `base_url`
   - `advanced` via explicit endpoints
   - optionally `embedded-host` for convenience mode
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
- embedded-host convenience mode
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

### Task 0: Validate the four runtime contracts before broader implementation

**Purpose:**
Resolve the last implementation-shaping contracts before the main package work begins.

**Files:**
- Modify: `docs/plans/2026-03-12-agentpod-design.md`
- Modify: `docs/plans/2026-03-12-agentpod-implementation.md`
- Modify: `docs/architecture-details.md`
- Create: `docs/plans/2026-03-12-agentpod-validation.md`

**Validation goals:**
- define the minimal signed join-manifest and join-token contract
- define the minimal `AGENTPOD.md` source-document format
- verify the dedicated spawned task-session approach against OpenClaw's architecture
- define an explicit AgentPod-to-OpenAgents mapping table so the hub layer stays thin

**Step 1: Write the validation addendum**

Capture:
- join manifest fields:
  - `network_id`
  - `directory_url`
  - `substrate_url`
  - `issuer`
  - `issued_at`
  - `expires_at`
  - `signature`
- join token expectations:
  - short-lived
  - scoped to join/publication/delegation bootstrap
  - renewable without changing peer identity
- minimal `AGENTPOD.md` sections:
  - `Summary`
  - `Services`
  - `Inputs`
  - `Outputs`
  - `Safety`
- an initial mapping table:
  - AgentPod presence/publication -> OpenAgents discovery
  - AgentPod delegation/update/result -> OpenAgents task delegation
  - AgentPod artifact refs -> OpenAgents shared artifact

**Step 2: Run an OpenClaw architecture spike**

Check the local `openclaw` checkout and document:
- where plugin code can create or request a new session
- whether a spawned task session can carry a `task_id` label
- how narrower tool policy and transcript separation can be attached
- what the fallback is if true session spawning is unavailable

This step is successful when the plan can name a concrete OpenClaw integration seam rather than relying on architecture intuition.

**Step 3: Update the design docs from the spike**

Propagate the findings into:
- design doc
- implementation plan
- architecture details

**Step 4: Commit**

```bash
git add docs/plans/2026-03-12-agentpod-design.md docs/plans/2026-03-12-agentpod-implementation.md docs/architecture-details.md docs/plans/2026-03-12-agentpod-validation.md
git commit -m "docs: add AgentPod validation addendum"
```

### Task 1: Scaffold the AgentPod workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `packages/agentpod-contract/package.json`
- Create: `packages/agentpod-contract/tsconfig.json`
- Create: `packages/agentpod-contract/src/index.ts`
- Create: `packages/agentpod-contract/src/index.test.ts`
- Create: `packages/agentpod-openagents-client/package.json`
- Create: `packages/agentpod-openagents-client/tsconfig.json`
- Create: `packages/agentpod-openagents-client/src/index.ts`
- Create: `packages/agentpod-hub/package.json`
- Create: `packages/agentpod-hub/tsconfig.json`
- Create: `packages/agentpod-hub/src/index.ts`
- Create: `packages/agentpod-hub/src/index.test.ts`
- Create: `packages/agentpod-openclaw-plugin/package.json`
- Create: `packages/agentpod-openclaw-plugin/tsconfig.json`
- Create: `packages/agentpod-openclaw-plugin/index.ts`
- Create: `packages/agentpod-openclaw-plugin/openclaw.plugin.json`

**Step 1: Write the failing workspace smoke tests**

```ts
import { describe, expect, it } from "vitest";
import { AGENTPOD_PROTOCOL_VERSION } from "./index.js";

describe("agentpod contract workspace", () => {
  it("exports the protocol version", () => {
    expect(AGENTPOD_PROTOCOL_VERSION).toBe("0.1");
  });
});
```

```ts
import { describe, expect, it } from "vitest";
import { createHubMarker } from "./index.js";

describe("agentpod hub workspace", () => {
  it("exports a hub marker", () => {
    expect(createHubMarker()).toBe("agentpod-hub");
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
- `pnpm vitest packages/agentpod-contract/src/index.test.ts`
- `pnpm vitest packages/agentpod-hub/src/index.test.ts`

Expected: FAIL because the workspace packages do not exist yet.

**Step 3: Add minimal workspace scaffolding**

Create a pnpm workspace with four packages:
- `agentpod-contract`
- `agentpod-openagents-client`
- `agentpod-hub`
- `agentpod-openclaw-plugin`

In `packages/agentpod-openclaw-plugin/package.json`, mirror OpenClaw extension packaging conventions:

```json
{
  "name": "@agentpod/openclaw-plugin",
  "private": true,
  "type": "module",
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

**Step 4: Run tests to verify they pass**

Run:
- `pnpm vitest packages/agentpod-contract/src/index.test.ts`
- `pnpm vitest packages/agentpod-hub/src/index.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.json vitest.config.ts packages
git commit -m "chore: scaffold AgentPod workspace"
```

### Task 2: Define public schemas, network-profile schemas, and policy merge rules

**Files:**
- Modify: `packages/agentpod-contract/src/index.ts`
- Create: `packages/agentpod-contract/src/schema.ts`
- Create: `packages/agentpod-contract/src/policy.ts`
- Create: `packages/agentpod-contract/src/schema.test.ts`
- Create: `packages/agentpod-contract/src/policy.test.ts`

**Step 1: Write the failing schema and policy tests**

Add tests for:
- `CapabilityManifest` containing multiple `ServiceSpec` entries
- `PeerProfile` carrying public key identity material
- `TaskRequest.input` requiring `payload` and `attachments`
- `ManagedNetworkProfile` requiring `join_url`
- `PrivateNetworkProfile` using `base_url`
- `AdvancedNetworkProfile` requiring explicit endpoints
- `SingleActiveNetworkConfig` rejecting multiple active profiles
- `resolveEffectivePolicy()` choosing the strictest result

```ts
it("keeps payload and attachments separate", () => {
  const parsed = TaskRequestSchema.parse({
    task_id: "task_1",
    service: "product_brainstorm",
    input: { payload: { text: "hi" }, attachments: [] },
    policy: { tool_use: "ask", followups: "deny", result_detail: "summary" },
    delivery: { reply: "origin_session", artifacts: "inline_only" },
  });
  expect(parsed.input.attachments).toEqual([]);
});
```

```ts
it("accepts a managed profile with join_url", () => {
  const parsed = NetworkProfileSchema.parse({
    mode: "managed",
    join_url: "https://agentpod.ai/networks/public",
  });
  expect(parsed.mode).toBe("managed");
});
```

```ts
it("uses the strictest effective policy", () => {
  expect(
    resolveEffectivePolicy({
      owner: { tool_use: "ask" },
      service: { tool_use: "auto" },
      request: { tool_use: "auto" },
    }).tool_use,
  ).toBe("ask");
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest packages/agentpod-contract/src/schema.test.ts packages/agentpod-contract/src/policy.test.ts`

Expected: FAIL because schemas and policy logic are missing.

**Step 3: Implement minimal schemas and policy utilities**

Export:
- `PeerProfileSchema`
- `CapabilityManifestSchema`
- `ServiceSpecSchema`
- `AgentPodSourceDocumentSchema`
- `NetworkProfileSchema`
- `TaskRequestSchema`
- `TaskUpdateSchema`
- `TaskResultSchema`
- `resolveEffectivePolicy()`

Keep OpenAgents names out of this package entirely.

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest packages/agentpod-contract/src/schema.test.ts packages/agentpod-contract/src/policy.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/agentpod-contract
git commit -m "feat: add AgentPod contract schemas and policy merge"
```

### Task 3: Build the replaceable OpenAgents client adapter boundary

**Files:**
- Modify: `packages/agentpod-openagents-client/src/index.ts`
- Create: `packages/agentpod-openagents-client/src/types.ts`
- Create: `packages/agentpod-openagents-client/src/adapter.ts`
- Create: `packages/agentpod-openagents-client/src/transport.ts`
- Create: `packages/agentpod-openagents-client/src/adapter.test.ts`
- Create: `packages/agentpod-openagents-client/src/fakes.ts`

**Step 1: Write the failing adapter tests**

Test that the adapter:
- accepts `CapabilityManifest` and emits substrate-specific registration calls
- translates `TaskRequest` to a substrate delegation request
- translates substrate task updates back into `TaskUpdate` and `TaskResult`
- exposes an at-most-once delivery contract to the plugin layer
- maps relay-backed artifact refs without leaking substrate objects
- does not leak OpenAgents-specific types from the package entrypoint

```ts
it("maps TaskRequest into substrate delegation input", async () => {
  const transport = createFakeTransport();
  const client = createOpenAgentsAdapter({ transport });
  await client.delegate(taskRequestFixture());
  expect(transport.calls[0]?.kind).toBe("delegate");
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest packages/agentpod-openagents-client/src/adapter.test.ts`

Expected: FAIL because adapter code does not exist.

**Step 3: Implement a narrow client interface**

Expose only AgentPod-shaped methods such as:
- `publishManifest()`
- `listPeers()`
- `delegate()`
- `subscribeTask()`
- `publishSourceDocumentProjection()`

Internally isolate substrate mapping in `adapter.ts`.

Do not export:
- OpenAgents event names
- OpenAgents model classes
- raw substrate payloads

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest packages/agentpod-openagents-client/src/adapter.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/agentpod-openagents-client
git commit -m "feat: add replaceable OpenAgents adapter boundary"
```

### Task 4: Build the thin AgentPod hub for join, projection, and embedded bootstrap

**Files:**
- Modify: `packages/agentpod-hub/src/index.ts`
- Create: `packages/agentpod-hub/src/config.ts`
- Create: `packages/agentpod-hub/src/join/join-manifest-server.ts`
- Create: `packages/agentpod-hub/src/join/token-issuer.ts`
- Create: `packages/agentpod-hub/src/join/token-renew.ts`
- Create: `packages/agentpod-hub/src/join/revocation.ts`
- Create: `packages/agentpod-hub/src/projection/public-card-projector.ts`
- Create: `packages/agentpod-hub/src/projection/visibility-filter.ts`
- Create: `packages/agentpod-hub/src/projection/verification-badges.ts`
- Create: `packages/agentpod-hub/src/operator-api/routes.ts`
- Create: `packages/agentpod-hub/src/embedded/bootstrap.ts`
- Create: `packages/agentpod-hub/src/openagents/wiring.ts`
- Create: `packages/agentpod-hub/src/server.test.ts`

**Step 1: Write the failing hub tests**

Cover:
- join manifest endpoint returns signed manifest metadata
- token exchange and renew route through the hub join layer
- public card projection reads sanitized data from OpenAgents-backed discovery state
- embedded-host bootstrap starts one local hub process/configuration shape
- revocation hides withdrawn public cards from the public-card API

```ts
it("projects a sanitized public card from discovery-backed state", async () => {
  const hub = createHubHarness();
  await hub.publishCapabilityFixture({ peerId: "peer_1", visibility: "public" });
  const card = await hub.getPublicCard("peer_1");
  expect(card?.peer_id).toBe("peer_1");
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest packages/agentpod-hub/src/server.test.ts`

Expected: FAIL.

**Step 3: Implement the minimal hub**

Implement:
- join-manifest hosting
- token issuing / renewal / revocation
- directory projection for public cards
- thin deployment helpers around OpenAgents-backed discovery, delegation, and artifacts
- embedded-host bootstrap wiring

Do not reimplement a second independent delivery protocol in this package.
The package should wrap OpenAgents-backed behavior and expose operator-facing surfaces only.

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest packages/agentpod-hub/src/server.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/agentpod-hub
git commit -m "feat: add AgentPod hub with mailbox delivery"
```

### Task 5: Add plugin state, background service skeleton, and network-profile resolution

**Files:**
- Modify: `packages/agentpod-openclaw-plugin/index.ts`
- Create: `packages/agentpod-openclaw-plugin/src/config.ts`
- Create: `packages/agentpod-openclaw-plugin/src/state/store.ts`
- Create: `packages/agentpod-openclaw-plugin/src/state/types.ts`
- Create: `packages/agentpod-openclaw-plugin/src/network/profile.ts`
- Create: `packages/agentpod-openclaw-plugin/src/network/profile.test.ts`
- Create: `packages/agentpod-openclaw-plugin/src/service/agentpod-service.ts`
- Create: `packages/agentpod-openclaw-plugin/src/service/agentpod-service.test.ts`
- Create: `packages/agentpod-openclaw-plugin/src/capabilities/source-document.ts`
- Create: `packages/agentpod-openclaw-plugin/src/capabilities/source-document.test.ts`

**Step 1: Write the failing service and profile tests**

Test that the plugin service:
- starts and stops cleanly
- loads persisted task and peer state
- constructs the OpenAgents client through an injected adapter factory
- resolves `managed`, `private`, and `advanced` profiles into concrete endpoints
- supports an `embedded-host` flag that launches or connects to a local hub process
- enforces a single active network profile
- loads and compiles local `AGENTPOD.md`

**Step 2: Run tests to verify they fail**

Run:
- `pnpm vitest packages/agentpod-openclaw-plugin/src/network/profile.test.ts`
- `pnpm vitest packages/agentpod-openclaw-plugin/src/service/agentpod-service.test.ts`
- `pnpm vitest packages/agentpod-openclaw-plugin/src/capabilities/source-document.test.ts`

Expected: FAIL.

**Step 3: Implement minimal plugin service and store**

Create:
- config normalization
- file-backed local store for `network`, `directory`, and `task` state
- a background service shell with start/stop hooks
- network profile records that separate `directory_url`, `substrate_url`, `publish_to_directory`, and visibility state
- join-manifest resolution logic for `join_url`
- `base_url` derivation for private mode
- local `AGENTPOD.md` load and compile path

Register the service in `index.ts`, but keep behavior minimal until later tasks.

**Step 4: Run tests to verify they pass**

Run:
- `pnpm vitest packages/agentpod-openclaw-plugin/src/network/profile.test.ts`
- `pnpm vitest packages/agentpod-openclaw-plugin/src/service/agentpod-service.test.ts`
- `pnpm vitest packages/agentpod-openclaw-plugin/src/capabilities/source-document.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/agentpod-openclaw-plugin
git commit -m "feat: add AgentPod plugin service and profile resolution"
```

### Task 6: Add owner-facing commands, Gateway RPC methods, and join flows

**Files:**
- Modify: `packages/agentpod-openclaw-plugin/index.ts`
- Create: `packages/agentpod-openclaw-plugin/src/commands/agentpod-command.ts`
- Create: `packages/agentpod-openclaw-plugin/src/commands/agentpod-command.test.ts`
- Create: `packages/agentpod-openclaw-plugin/src/gateway/methods.ts`
- Create: `packages/agentpod-openclaw-plugin/src/gateway/methods.test.ts`
- Create: `packages/agentpod-openclaw-plugin/src/cli/register-cli.ts`
- Create: `packages/agentpod-openclaw-plugin/src/cli/register-cli.test.ts`

**Step 1: Write the failing command and RPC tests**

Cover:
- `/agentpod join`
- `/agentpod leave`
- `/agentpod peers`
- `/agentpod tasks`
- `/agentpod host start`
- `/agentpod host status`
- `agentpod.status`
- `agentpod.peers.list`
- `agentpod.tasks.list`
- `agentpod.network.join`
- `agentpod.network.leave`
- `agentpod.policy.get`
- `openclaw agentpod join`
- `openclaw agentpod host start`

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest packages/agentpod-openclaw-plugin/src/commands/agentpod-command.test.ts packages/agentpod-openclaw-plugin/src/gateway/methods.test.ts packages/agentpod-openclaw-plugin/src/cli/register-cli.test.ts`

Expected: FAIL.

**Step 3: Implement minimal deterministic command and RPC handlers**

Commands and CLI handlers should forward into the background service.
Gateway methods should return typed JSON summaries, not raw substrate responses.

Add deterministic join flows for:
- `join_url`
- `base_url`
- advanced explicit endpoint profile
- embedded-host startup

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest packages/agentpod-openclaw-plugin/src/commands/agentpod-command.test.ts packages/agentpod-openclaw-plugin/src/gateway/methods.test.ts`
Run: `pnpm vitest packages/agentpod-openclaw-plugin/src/cli/register-cli.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/agentpod-openclaw-plugin
git commit -m "feat: add AgentPod join flows, commands, and Gateway RPC"
```

### Task 7: Add agent-facing tools for peer discovery and async delegation

**Files:**
- Modify: `packages/agentpod-openclaw-plugin/index.ts`
- Create: `packages/agentpod-openclaw-plugin/src/tools/agentpod-peers.ts`
- Create: `packages/agentpod-openclaw-plugin/src/tools/agentpod-tasks.ts`
- Create: `packages/agentpod-openclaw-plugin/src/tools/agentpod-delegate.ts`
- Create: `packages/agentpod-openclaw-plugin/src/tools/agentpod-tools.test.ts`

**Step 1: Write the failing tool tests**

Test that:
- `agentpod_peers` returns local manifest-shaped summaries
- `agentpod_tasks` returns task handles and statuses
- `agentpod_delegate` returns quickly with a task handle and initial state
- `agentpod_peers` returns loaded metadata without search/ranking

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest packages/agentpod-openclaw-plugin/src/tools/agentpod-tools.test.ts`

Expected: FAIL.

**Step 3: Implement the tool layer**

Wire the tools into the service and ensure:
- tool inputs use `TaskRequest`-shaped data
- tool outputs stay AgentPod-shaped
- no OpenAgents raw payload escapes the tool surface

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest packages/agentpod-openclaw-plugin/src/tools/agentpod-tools.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/agentpod-openclaw-plugin
git commit -m "feat: add AgentPod agent-facing tools"
```

### Task 8: Add inbound task execution guard, approvals, and artifact policy

**Files:**
- Create: `packages/agentpod-openclaw-plugin/src/policy/execution-guard.ts`
- Create: `packages/agentpod-openclaw-plugin/src/policy/execution-guard.test.ts`
- Create: `packages/agentpod-openclaw-plugin/src/tasks/task-runner.ts`
- Create: `packages/agentpod-openclaw-plugin/src/tasks/task-runner.test.ts`
- Create: `packages/agentpod-openclaw-plugin/src/artifacts/artifact-bridge.ts`
- Create: `packages/agentpod-openclaw-plugin/src/artifacts/artifact-bridge.test.ts`

**Step 1: Write the failing safety tests**

Cover:
- strict policy merge
- `followups: deny` semantics
- approval requirement for `tool_use: ask`
- artifact rejection under `inline_only`
- duplicate inbound `task_id` is not executed twice
- accepted inbound work creates a dedicated spawned task session

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest packages/agentpod-openclaw-plugin/src/policy/execution-guard.test.ts packages/agentpod-openclaw-plugin/src/tasks/task-runner.test.ts packages/agentpod-openclaw-plugin/src/artifacts/artifact-bridge.test.ts`

Expected: FAIL.

**Step 3: Implement minimal guarded execution**

Implement:
- effective policy merge using the contract package
- task admission checks
- guarded local task-session creation
- execution summary recording
- artifact policy enforcement

Do not use a fake executor here.
This task must integrate with real OpenClaw spawned-session behavior or stop and push findings back into Task 0.

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest packages/agentpod-openclaw-plugin/src/policy/execution-guard.test.ts packages/agentpod-openclaw-plugin/src/tasks/task-runner.test.ts packages/agentpod-openclaw-plugin/src/artifacts/artifact-bridge.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/agentpod-openclaw-plugin
git commit -m "feat: add guarded task execution and artifact policy"
```

### Task 9: Add plugin ingress, substrate sync, and public-card publication

**Files:**
- Modify: `packages/agentpod-openclaw-plugin/index.ts`
- Create: `packages/agentpod-openclaw-plugin/src/http/routes.ts`
- Create: `packages/agentpod-openclaw-plugin/src/http/routes.test.ts`
- Create: `packages/agentpod-openclaw-plugin/src/service/substrate-sync.ts`
- Create: `packages/agentpod-openclaw-plugin/src/service/substrate-sync.test.ts`
- Create: `packages/agentpod-openclaw-plugin/src/directory/public-card.ts`
- Create: `packages/agentpod-openclaw-plugin/src/directory/public-card.test.ts`

**Step 1: Write the failing ingress and sync tests**

Cover:
- authenticated plugin route registration
- inbound task update mapping
- result translation into local task store entries
- published-card sync when public visibility is enabled
- signed publication of identity-bearing peer metadata

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest packages/agentpod-openclaw-plugin/src/http/routes.test.ts packages/agentpod-openclaw-plugin/src/service/substrate-sync.test.ts packages/agentpod-openclaw-plugin/src/directory/public-card.test.ts`

Expected: FAIL.

**Step 3: Implement route and sync handlers**

Use plugin-owned HTTP routes for ingress.
Route handlers should validate AgentPod-facing payloads, then hand off to the service.
Substrate sync code should remain the only place that understands transport-specific update shapes.

Include explicit sync points for:
- publishing or withdrawing sanitized public cards
- refreshing peer cache after join or reconnect
- publishing compiled `AGENTPOD.md` output rather than raw source markdown

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest packages/agentpod-openclaw-plugin/src/http/routes.test.ts packages/agentpod-openclaw-plugin/src/service/substrate-sync.test.ts packages/agentpod-openclaw-plugin/src/directory/public-card.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/agentpod-openclaw-plugin
git commit -m "feat: add AgentPod ingress and public-card sync"
```

### Task 10: Add local dev harness and integration coverage against reference deployments

**Files:**
- Create: `scripts/dev-openclaw-link.sh`
- Create: `scripts/dev-openagents-config.md`
- Create: `scripts/dev-public-directory.md`
- Create: `scripts/dev-private-hub.md`
- Create: `scripts/dev-embedded-host.md`
- Create: `test/integration/agentpod-openclaw.integration.test.ts`
- Create: `test/integration/fixtures/fake-substrate-server.ts`
- Create: `test/integration/fixtures/fake-directory-server.ts`
- Create: `test/integration/fixtures/fake-mailbox-server.ts`
- Modify: `README.md`

**Step 1: Write the failing integration test**

Test the end-to-end happy path:
- plugin starts
- join works with an outbound-only network profile
- peer list is available from fake substrate
- delegation returns a handle
- task update and result are reflected locally
- public-card publication sends only sanitized fields to the fake directory
- offline mailbox delivery works for an outbound-only peer
- embedded-host mode works for a two-machine local-lab topology
- duplicate inbound task replay does not execute the same task twice
- only one active network profile is allowed

**Step 2: Run test to verify it fails**

Run: `pnpm vitest test/integration/agentpod-openclaw.integration.test.ts`

Expected: FAIL.

**Step 3: Implement harness and docs**

Add:
- a fake substrate server for deterministic integration tests
- a fake directory server for public-card verification
- a fake mailbox-capable hub server for outbound-only delivery verification
- a script or README instructions for linking the plugin into the checked-out `openclaw`
- local notes for running against the checked-out `openagents` server during manual verification
- explicit runbooks for:
  - managed public join by URL
  - Mac mini / home host outbound-only setup
  - VPC-hosted private-network setup
  - private network with a separate self-hosted hub
  - embedded-host convenience mode
  - optional public-card publication to the website-backed directory
  - generating and refreshing `AGENTPOD.md`

**Step 4: Run integration tests to verify they pass**

Run: `pnpm vitest test/integration/agentpod-openclaw.integration.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts test README.md
git commit -m "test: add AgentPod integration harness"
```

### Task 11: Verify the full workspace and prepare the first milestone

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-03-12-agentpod-design.md`
- Modify: `docs/plans/2026-03-12-agentpod-implementation.md`
- Modify: `docs/joins.md`
- Modify: `docs/architecture-details.md`

**Step 1: Run the full test suite**

Run: `pnpm vitest`

Expected: PASS for all package and integration tests.

**Step 2: Run packaging and typecheck verification**

Run: `pnpm -r exec tsc --noEmit`

Expected: PASS with no type errors.

**Step 3: Update milestone docs**

Refresh README install/dev sections and note:
- OpenAgents is the default substrate
- OpenAgents is behind a replaceable adapter boundary
- no OpenAgents-specific public schema is guaranteed
- network join is explicit and owner-controlled
- public website cards are sanitized directory projections, not direct OpenClaw introspection
- private networks can be deployed either with a separate shared hub or in embedded-host mode
- outbound-only delivery requires presence plus mailbox semantics in the hub/substrate
- v0.1 supports a single active network only
- v0.1 discovery loads metadata and lets the local agent choose
- v0.1 delivery is at-most-once and prioritizes avoiding duplicate execution
- published services come from local `AGENTPOD.md`
- remote execution uses dedicated spawned task sessions

**Step 4: Re-run verification**

Run:
- `pnpm vitest`
- `pnpm -r exec tsc --noEmit`

Expected: PASS again after doc and config updates.

**Step 5: Commit**

```bash
git add README.md docs/joins.md docs/architecture-details.md docs/plans/2026-03-12-agentpod-design.md docs/plans/2026-03-12-agentpod-implementation.md
git commit -m "docs: finalize AgentPod MVP plan and verification notes"
```
