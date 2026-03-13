# AgentPod Subagent Runtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace fake delegated-task execution with a real OpenClaw plugin-runtime subagent path for accepted inbound AgentPod work.

**Architecture:** Keep AgentPod's network/control layer in the plugin and hub, then route accepted inbound tasks through `api.runtime.subagent.run()` plus plugin hooks to recover `childSessionKey` and emit real task lifecycle events. The hub remains thin by forwarding delegated tasks to an injected runtime-backed delivery seam instead of fabricating completion.

**Tech Stack:** TypeScript, OpenClaw plugin runtime hooks, Node.js HTTP/SSE, pnpm, Vitest

---

### Task 1: Add failing tests for subagent lifecycle tracking

**Files:**
- Create: `plugin/test/subagent-tracker.test.ts`
- Create: `plugin/runtime/subagent-tracker.ts`

**Step 1: Write the failing test**

- Assert that a tracker can record `subagent_spawned` events and resolve a waiting caller with the correct `childSessionKey`.
- Assert that waiting for an unknown `runId` times out with a typed error.
- Assert that `subagent_ended` state can be queried for terminal outcome.

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run plugin/test/subagent-tracker.test.ts`
Expected: FAIL because the tracker module does not exist yet.

**Step 3: Write minimal implementation**

- Add an in-memory tracker keyed by `runId`.
- Support:
  - `noteSpawned(event)`
  - `noteEnded(event)`
  - `waitForSpawned(runId, timeoutMs?)`
  - `getEnded(runId)`

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run plugin/test/subagent-tracker.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add plugin/runtime/subagent-tracker.ts plugin/test/subagent-tracker.test.ts
git commit -m "feat: add subagent lifecycle tracker"
```

### Task 2: Add failing tests for runtime-backed inbound task execution

**Files:**
- Create: `plugin/test/subagent-executor.test.ts`
- Create: `plugin/runtime/subagent-executor.ts`
- Modify: `plugin/tasks/runner.ts`

**Step 1: Write the failing test**

- Assert that accepting inbound work calls `runtime.subagent.run()` with:
  - owner session key
  - generated task message
  - `idempotencyKey` derived from `task_id`
- Assert that acceptance does not report success until `subagent_spawned` provides `childSessionKey`.
- Assert that duplicate inbound tasks still do not run twice.

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run plugin/test/task-runner.test.ts plugin/test/subagent-executor.test.ts`
Expected: FAIL because task execution still relies on the old fake `spawnSession` seam.

**Step 3: Write minimal implementation**

- Add a runtime executor that wraps `api.runtime.subagent.run()`.
- Build a deterministic task prompt from `service`, `payload`, and attachments.
- Update the task runner to use the executor result.

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run plugin/test/task-runner.test.ts plugin/test/subagent-executor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add plugin/tasks/runner.ts plugin/runtime/subagent-executor.ts plugin/test/task-runner.test.ts plugin/test/subagent-executor.test.ts
git commit -m "feat: execute inbound tasks through runtime subagents"
```

### Task 3: Add failing tests for background-service integration

**Files:**
- Modify: `plugin/test/service.test.ts`
- Modify: `plugin/service/background.ts`

**Step 1: Write the failing test**

- Assert that the background service can accept an inbound task, run it through the runtime executor, and store a running inbound handle with `childSessionKey`.
- Assert that terminal subagent completion is translated into an AgentPod `TaskResult` event.

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run plugin/test/service.test.ts`
Expected: FAIL because the service has no inbound execution path or runtime event translation.

**Step 3: Write minimal implementation**

- Inject the runtime executor and subagent tracker into the service.
- Add:
  - `acceptInboundTask(task)`
  - `noteSubagentSpawned(event)`
  - `noteSubagentEnded(event)`
- Keep state handling in-memory and minimal for v0.1.

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run plugin/test/service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add plugin/service/background.ts plugin/test/service.test.ts
git commit -m "feat: wire inbound task execution into background service"
```

### Task 4: Add failing tests for OpenClaw plugin registration and hook wiring

**Files:**
- Modify: `plugin/test/index.test.ts`
- Modify: `plugin/index.ts`

**Step 1: Write the failing test**

- Assert that the default plugin registration:
  - consumes `api.runtime.subagent`
  - registers `subagent_spawned` and `subagent_ended` hook handlers
  - wires inbound-task execution through the background service

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run plugin/test/index.test.ts`
Expected: FAIL because the plugin does not yet register subagent lifecycle hooks or runtime-backed inbound execution.

**Step 3: Write minimal implementation**

- Build the runtime executor during `register(api)`.
- Register the hook handlers that forward lifecycle events into the service/tracker.

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run plugin/test/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add plugin/index.ts plugin/test/index.test.ts
git commit -m "feat: wire agentpod plugin to openclaw subagent hooks"
```

### Task 5: Add failing tests for hub task delivery without fake completion

**Files:**
- Modify: `hub/test/server.test.ts`
- Modify: `hub/operator-api/routes.ts`
- Modify: `hub/index.ts`

**Step 1: Write the failing test**

- Assert that `/v1/tasks/delegate` calls an injected runtime-backed delivery handler.
- Assert that the endpoint returns `queued` without immediately emitting a fabricated final result.
- Assert that the SSE stream only emits events supplied by the delivery handler.

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run hub/test/server.test.ts`
Expected: FAIL because the router still fabricates `running` and `completed` events directly.

**Step 3: Write minimal implementation**

- Add an optional injected task-delivery handler to `createHubRouter()` / `startHubServer()`.
- Use the existing subscriber map for event fanout.
- Preserve current HTTP/SSE contract.

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run hub/test/server.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add hub/operator-api/routes.ts hub/index.ts hub/test/server.test.ts
git commit -m "feat: route delegated tasks through runtime-backed delivery"
```

### Task 6: Full verification

**Files:**
- Modify: `docs/plans/2026-03-13-agentpod-subagent-runtime-design.md` if implementation drift is found
- Modify: `docs/plans/2026-03-13-agentpod-subagent-runtime-implementation.md` if commands or file paths drift

**Step 1: Run focused suite**

Run: `pnpm exec vitest run plugin/test/subagent-tracker.test.ts plugin/test/subagent-executor.test.ts plugin/test/task-runner.test.ts plugin/test/service.test.ts plugin/test/index.test.ts hub/test/server.test.ts`
Expected: PASS

**Step 2: Run full test suite**

Run: `pnpm exec vitest run`
Expected: PASS

**Step 3: Run typecheck**

Run: `pnpm exec tsc --noEmit -p plugin/tsconfig.json && pnpm exec tsc --noEmit -p hub/tsconfig.json`
Expected: PASS

**Step 4: Commit final polish if needed**

```bash
git add docs/plans plugin hub
git commit -m "chore: polish runtime-backed task delegation"
```
