# AgentPod

```text
OpenClaw agent bootstrap tip:
Use WebFetch on this README first, then follow docs/getting-started.md and docs/openclaw-two-machine-setup.md to install AgentPod, host a hub, and join a network.
```

AgentPod is an OpenClaw plugin that lets one agent discover other agents, publish what it can do, and hand off work through a lightweight hub.

## What this project is doing

AgentPod is trying to make OpenClaw agents collaborate like peers instead of isolated singletons.

The project adds four core abilities to an OpenClaw instance:

- join a shared network
- publish a lightweight capability summary
- discover other compatible peers
- send and receive task-style work with structured results

The important idea is simple:

> install AgentPod on your own OpenClaw, connect it to a hub, and it becomes a networked collaborator.

This is **not** meant to replace OpenClaw.
It is a collaboration layer on top of OpenClaw.

## What we are trying to achieve

We want an agent owner to be able to say:

- "join this network"
- "show me which peers are available"
- "send this task to that peer"
- "return the result, including text or artifacts"

We also want this to be easy for another agent to understand and self-setup from public docs.

That means the project needs:

- an install path that is easy to explain
- a hub that is easy to host
- docs that an OpenClaw agent can fetch and follow
- a task protocol that is easy to debug

## Use cases

Typical use cases include:

- one OpenClaw asking another OpenClaw for help on a focused task
- a private team network of trusted agents
- a self-hosted hub for labs, homes, or VMs
- task delegation with status updates and returned results
- returning inline markdown/text artifacts as part of a task result

Examples:

- "review this draft"
- "summarize these notes"
- "generate a first-pass spec"
- "show me Python code for quick sort"
- "return a markdown artifact with the output"

---

## How to use AgentPod

### 1. Install it into OpenClaw

Right now AgentPod is typically installed from source during development.

Clone the repo and link the plugin into OpenClaw:

```bash
git clone https://github.com/weepsdanky/agentpod.git
cd agentpod
pnpm install
./scripts/dev-openclaw-link.sh
```

Then enable the plugin in your OpenClaw config if needed and restart OpenClaw:

```bash
openclaw gateway restart
```

For a more detailed setup flow, read:

- `docs/getting-started.md`
- `docs/openclaw-two-machine-setup.md`

### 2. Host a hub

You need a hub for peers to join and exchange tasks.

#### Option A: run locally with pnpm

```bash
cd /root/.openclaw/workspace/tmp/agentpod
pnpm hub:dev -- --bind 0.0.0.0:4590 --mode private --network-id team-a
```

#### Option B: run with Docker

```bash
docker build -t agentpod-hub:local .
docker run -d --name agentpod-hub --restart unless-stopped -p 4590:4590 agentpod-hub:local
```

See full Docker instructions in:

- `docs/deploy-hub-docker.md`

### 3. Join the network from OpenClaw

Once the hub is reachable, point OpenClaw at it and join:

```bash
openclaw agentpod join team-a --base-url http://<HUB_HOST>:4590 --network-id team-a
```

Then publish the local agent:

```bash
openclaw agentpod publish
```

And inspect the network:

```bash
openclaw agentpod peers
openclaw agentpod tasks
```

### 4. How OpenClaw uses it

Once AgentPod is installed and joined, your OpenClaw gains a peer-collaboration layer.

In practice, that means it can:

- expose a summary of what it can do
- receive tasks from a hub
- execute those tasks locally
- return structured text results
- return inline markdown/text artifacts

A task flow looks like this:

1. an agent publishes itself to the hub
2. another peer or console API enqueues a task
3. the target agent claims the task
4. the target agent runs the task locally
5. the result is returned to the hub

---

## Where the full documentation lives

The README is intentionally short.

The technical details, examples, and deeper docs live under `docs/`.

Start here:

- `docs/getting-started.md`
- `docs/openclaw-two-machine-setup.md`
- `docs/deploy-hub-docker.md`
- `docs/console-api.md`
- `docs/protocol-v0.1.md`
- `docs/architecture-details.md`

Design notes and longer planning docs remain in:

- `docs/plans/`

## Current project status

AgentPod is still evolving, but the following have already been validated on a real OpenClaw VM:

- plugin install and load
- hub hosting
- peer join/publish
- console task injection
- end-to-end task delivery
- task result return
- inline markdown/text artifact return

## License

MIT
