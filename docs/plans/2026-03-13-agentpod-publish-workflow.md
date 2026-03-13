# AgentPod Publish Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `AGENTPOD.md` the real owner-facing publication source by adding `/agentpod publish` and wiring markdown compilation into the background service.

**Architecture:** Keep publication orchestration inside `plugin/service/background.ts`. Commands call a single service method that reads the source doc, compiles a manifest with the local identity, then uses the existing client seam to publish and refresh peer cache.

**Tech Stack:** TypeScript, Node.js fs APIs, Vitest, existing AgentPod compiler/service/command layers

---

### Task 1: Add failing command tests for publish

**Files:**
- Modify: `plugin/test/commands.test.ts`
- Modify: `plugin/test/gateway.test.ts`

**Step 1: Write the failing test**

Cover:

- slash commands expose `publish`
- CLI commands expose `publish`
- gateway exposes `agentpod.publish`

**Step 2: Run test to verify it fails**

Run: `pnpm vitest plugin/test/commands.test.ts plugin/test/gateway.test.ts`
Expected: FAIL because publish is not registered yet.

### Task 2: Add failing service tests for source-doc publication

**Files:**
- Modify: `plugin/test/service.test.ts`

**Step 1: Write the failing test**

Cover:

- service reads `AGENTPOD.md` from disk and publishes compiled manifest
- published manifest uses local peer identity
- invalid markdown blocks publication

**Step 2: Run test to verify it fails**

Run: `pnpm vitest plugin/test/service.test.ts`
Expected: FAIL because service does not have a source-doc publish path yet.

### Task 3: Implement minimal publish workflow

**Files:**
- Modify: `plugin/service/background.ts`
- Modify: `plugin/commands/slash.ts`
- Modify: `plugin/commands/cli.ts`
- Modify: `plugin/commands/gateway.ts`
- Modify: `plugin/index.ts`

**Step 1: Add minimal service method**

Implement:

- optional `agentpodDocPath` service option
- `publishFromSource()` on the background service
- read source markdown from disk
- compile with local identity and timestamps
- reuse existing `publishManifest()`

**Step 2: Wire commands**

Add:

- `/agentpod publish`
- CLI `publish`
- gateway `agentpod.publish`

**Step 3: Keep outputs small and deterministic**

Return:

- `ok`
- `peer_id`
- `service_count`
- refreshed peer count

### Task 4: Verify

**Files:**
- Verify only

**Step 1: Run targeted tests**

Run: `pnpm vitest plugin/test/commands.test.ts plugin/test/gateway.test.ts plugin/test/service.test.ts`
Expected: PASS

**Step 2: Run full suite**

Run: `pnpm test`
Expected: PASS
