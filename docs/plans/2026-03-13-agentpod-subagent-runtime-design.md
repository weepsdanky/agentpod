# AgentPod Plugin Runtime Subagent Design

**Date:** 2026-03-13

## Goal

Replace the current fake delegated-task completion path with a plugin-API-only design that lets AgentPod:

- join and stay connected to a lightweight peer network
- accept inbound delegated work
- execute accepted work in a real OpenClaw spawned subagent session
- translate local session lifecycle into AgentPod task state updates

## Why This Design

The current implementation proves the contract shape, but it still fakes the most important runtime path:

- `hub` accepts `/v1/tasks/delegate`
- `hub` immediately emits synthetic `running` and `completed` events
- no real remote execution happens
- `plugin/tasks/runner.ts` exists, but nothing in the plugin or hub calls it

Direct plugin access to `sessions_spawn` is not available through the public OpenClaw plugin API. The stable plugin-facing execution surface is:

- `api.runtime.subagent.run()`
- `api.runtime.subagent.waitForRun()`
- `api.runtime.subagent.getSessionMessages()`
- `api.runtime.subagent.deleteSession()`
- hooks such as `subagent_spawned` and `subagent_ended`

That means the correct v0.1 direction is not "bypass the plugin API and reach into OpenClaw internals". The correct direction is "use the official plugin runtime plus hooks to reconstruct the task/session mapping AgentPod needs".

## Architecture

### 1. Network layer stays in AgentPod

AgentPod still owns peer-network behavior through plugin surfaces it already has:

- `registerService` for background connectivity and mailbox/task delivery
- `registerGatewayMethod` and/or `registerHttpRoute` for local control-plane entrypoints
- `registerTool` for agent-facing collaboration tools such as `agentpod_peers` and `agentpod_delegate`

This layer is responsible for:

- join/leave
- peer cache refresh
- task delegation to remote peers
- inbound task receipt from hub/substrate
- task event fanout back to the origin

### 2. Execution layer uses `runtime.subagent.run`

When an inbound task is accepted, AgentPod should start a real local spawned subagent session via the OpenClaw plugin runtime helper instead of a fake local seam.

Expected mapping:

- AgentPod inbound `TaskRequest` -> one `runtime.subagent.run()` call
- one accepted `task_id` -> one local `runId`
- one `runId` -> one `childSessionKey` learned from `subagent_spawned`
- one ended subagent session -> one terminal AgentPod task result

This preserves the v0.1 design invariant:

- accepted inbound work runs in a dedicated spawned task session
- duplicate `task_id` values never execute twice

### 3. Session identity comes from hooks

`runtime.subagent.run()` currently returns `runId`, not `childSessionKey`.

AgentPod should therefore maintain a small runtime tracker:

- `subagent_spawned` hook records `runId -> childSessionKey`
- `subagent_ended` hook records terminal lifecycle metadata
- the inbound execution path waits for the spawned mapping before marking the task as running with a local child session

This lets AgentPod preserve its existing task-registry model without requiring a new OpenClaw plugin API surface first.

### 4. Hub becomes delivery-oriented, not execution-oriented

`hub/operator-api/routes.ts` should stop fabricating immediate task completion.

Instead, the hub delegate endpoint should call an injected delivery/execution seam:

- accept the inbound `TaskRequest`
- hand it to the target peer runtime
- return `queued` once delivery is accepted
- emit task updates/results only when the runtime reports them

For the current repo shape, the minimal seam is an injected handler in `createHubRouter()` and `startHubServer()` that can:

- accept a task
- publish update/result events through the existing `subscribeTask()` stream

This keeps the hub thin while letting tests drive a real end-to-end task lifecycle.

## Proposed Components

### Plugin runtime adapter

New adapter around OpenClaw runtime:

- start a real subagent run for an inbound task
- generate the run message from `service`, `payload`, and attachments
- pass an idempotency key based on `task_id`
- capture `runId`
- wait for `subagent_spawned`
- return `childSessionKey`

Likely file:

- `plugin/runtime/subagent-executor.ts`

### Subagent lifecycle tracker

Small in-memory tracker owned by the plugin process:

- record `runId -> childSessionKey`
- record ended status by `runId` and/or `childSessionKey`
- allow awaiting spawned metadata for a just-started run

Likely file:

- `plugin/runtime/subagent-tracker.ts`

### Background service inbound execution seam

Extend the background service so it can:

- accept inbound tasks
- delegate accepted work to the runtime adapter
- expose task events for translation back to the hub/substrate

Likely file to modify:

- `plugin/service/background.ts`

### Plugin registration wiring

Extend the default OpenClaw plugin registration to:

- build the runtime adapter from `api.runtime.subagent`
- register hook handlers for `subagent_spawned` and `subagent_ended`
- connect inbound task acceptance to the background service

Likely file to modify:

- `plugin/index.ts`

### Hub delivery seam

Replace immediate fake completion with a runtime-backed delivery path.

Likely files to modify:

- `hub/operator-api/routes.ts`
- `hub/index.ts`

## Delivery Semantics For This Slice

This slice should make these behaviors true:

1. inbound task delivery uses a real local subagent spawn
2. duplicate inbound `task_id` is still suppressed
3. `queued` response returns quickly from the hub
4. `running` is emitted only after a real spawned session exists
5. terminal result is emitted from actual runtime completion, not fabricated immediately

Deliberately still out of scope for this slice:

- full OpenAgents mailbox substrate
- persisted crash-safe at-most-once state machine
- production-grade result extraction from rich transcripts
- managed-join auth redesign

## Risks And Constraints

### Result translation

`runtime.subagent.waitForRun()` gives run completion status, but AgentPod still needs a rule for converting local session output into a protocol `TaskResult`.

The minimal v0.1-compatible rule is:

- wait for run completion
- read recent child session messages
- synthesize a simple text result
- emit a failed result if the run errors or times out

### Hook ordering

The design assumes `subagent_spawned` arrives soon after `run()`. Tests should verify AgentPod tolerates the normal async ordering and times out cleanly if the hook never arrives.

### Official boundary

This design intentionally stays on the official OpenClaw plugin boundary. If a future OpenClaw plugin runtime exposes `sessions_spawn` or returns `childSessionKey` directly, AgentPod can simplify the adapter later without changing the protocol contract.
