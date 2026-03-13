# Local Dev Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `hub` deployment, OpenClaw plugin installation, and local AgentPod debugging practical with the current v0.1 thin implementation.

**Architecture:** Keep the existing thin TypeScript `hub` and plugin shape, then add the smallest real runtime seams needed for local operation: an executable HTTP server in `hub`, an HTTP/SSE transport in `plugin`, and developer scripts/runbooks that match the documented install and join flows.

**Tech Stack:** TypeScript, Node.js built-in `http`, Fetch/SSE-style streaming, pnpm, Vitest

---

### Task 1: Add failing runtime tests for deployable hub and network transport

**Files:**
- Modify: `hub/test/server.test.ts`
- Create: `plugin/test/http-transport.test.ts`
- Modify: `test/integration/agentpod-openclaw.integration.test.ts`

**Step 1: Write the failing tests**

- Add a hub test that starts a real HTTP server, fetches the join manifest over HTTP, delegates a task, and receives task events from a stream endpoint.
- Add a plugin transport test that uses real HTTP requests plus a streamed event endpoint.
- Extend the integration test so one happy path runs through the networked transport instead of the in-memory direct router only.

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest hub/test/server.test.ts plugin/test/http-transport.test.ts test/integration/agentpod-openclaw.integration.test.ts`

Expected: FAIL because no deployable HTTP server or HTTP/SSE transport exists yet.

**Step 3: Write minimal implementation**

- Keep all behavior in-process and in-memory.
- Add only the endpoints needed for the current docs and local dev flow.

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest hub/test/server.test.ts plugin/test/http-transport.test.ts test/integration/agentpod-openclaw.integration.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add hub plugin test
git commit -m "feat: add deployable hub transport loop"
```

### Task 2: Make the plugin installable by OpenClaw

**Files:**
- Modify: `plugin/index.ts`
- Modify: `plugin/package.json`
- Modify: `plugin/openclaw.plugin.json`
- Modify: `plugin/test/index.test.ts`

**Step 1: Write the failing tests**

- Assert that the plugin exports an OpenClaw-style default registration object/function shape.
- Assert that `plugin/package.json` contains `openclaw.extensions`.
- Assert that the manifest schema documents the minimum config needed for local dev.

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest plugin/test/index.test.ts`

Expected: FAIL because the package/install contract is incomplete.

**Step 3: Write minimal implementation**

- Export a default plugin object with `id`, `configSchema`, and `register(api)`.
- Keep the existing factory for unit tests.
- Add the minimum package metadata needed for `openclaw plugins install -l ./plugin`.

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest plugin/test/index.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add plugin
git commit -m "feat: make agentpod plugin installable in openclaw"
```

### Task 3: Add local developer scripts, examples, and runbooks

**Files:**
- Create: `scripts/dev-openclaw-link.sh`
- Create: `scripts/dev-public-directory.md`
- Create: `scripts/dev-private-hub.md`
- Create: `examples/managed-public/README.md`
- Create: `examples/managed-public/openclaw.json`
- Create: `examples/private-minimal/README.md`
- Create: `examples/private-minimal/openclaw.json`
- Modify: `README.md`

**Step 1: Write the failing tests/checks**

- Add a small repo-shape test that checks the expected files exist.
- Add a docs/runbook smoke check if a targeted test is cleaner than snapshot assertions.

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest plugin/test/workspace.test.ts`

Expected: FAIL because the runbooks/examples/scripts are missing.

**Step 3: Write minimal implementation**

- Keep the scripts simple and explicit.
- Prefer copy-pasteable commands over automation magic.
- Ensure the README points at one concrete local-dev path that works with the new hub server.

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest plugin/test/workspace.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add README.md scripts examples plugin/test/workspace.test.ts
git commit -m "docs: add local dev runbooks and examples"
```

### Task 4: Full verification

**Files:**
- Modify: `README.md` if any final command drift is found

**Step 1: Run the full test suite**

Run: `pnpm vitest`

Expected: PASS for all plugin, hub, and integration tests.

**Step 2: Run the typecheck**

Run: `pnpm exec tsc --noEmit`

Expected: PASS

**Step 3: Smoke-check the hub CLI**

Run: `node hub/index.ts --help`

Expected: exits successfully or prints the supported env/config contract.

**Step 4: Commit final polish if needed**

```bash
git add README.md hub/index.ts
git commit -m "chore: polish local dev loop"
```
