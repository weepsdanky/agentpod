# AgentPod MVP v0.1 Status

Last reviewed: 2026-03-13

This page is a short cross-check between the v0.1 docs and the current implementation in this repository.

It is intentionally blunt:

- `done` means there is working code in the repo for the feature
- `partial` means the shape exists, but the implementation does not yet fully satisfy the v0.1 docs
- `missing` means the v0.1 docs define it, but the repo does not yet implement it end-to-end

## Overall status

AgentPod is now past the pure mock/prototype stage.

The current codebase can:

- join one active network
- publish a compiled local `AGENTPOD.md`
- persist local peer identity
- list peers through the hub API
- delegate targeted tasks with `target_peer_id`
- queue tasks in a persistent hub mailbox
- poll and claim mailbox work from each OpenClaw instance
- execute accepted inbound work in a real local OpenClaw subagent session
- stream running/result events back through the hub

That means the current implementation is already usable for a basic multi-instance private collaboration loop.

It is not yet a complete implementation of every v0.1 requirement described in:

- `docs/protocol-v0.1.md`
- `docs/architecture-details.md`
- `docs/joins.md`

## Done

- One active network at a time
- Managed and private profile shapes in config
- Local `AGENTPOD.md` compilation and publish workflow
- Published manifest persistence through the hub publish endpoint
- Local peer identity persistence across restarts
- At-most-once duplicate suppression for inbound `task_id`
- Targeted delegation through `target_peer_id`
- Hub mailbox buffering for offline peers
- Mailbox persistence across hub restarts
- Polling-based outbound-only task delivery
- Real inbound execution through OpenClaw subagent runtime
- Running/result event flow back to the requester over hub task events
- Public-card projection route shape on the hub

## Partial

### Discovery and publication projection

The hub has publish, peer-list, and public-card endpoints, but they are not yet driven by one fully consistent dynamic discovery source.

Today:

- capability publish is accepted and stored
- public cards are projected from discovery records
- peer listing still depends on the configured peer profile source

So the full "publish -> discovery -> public card visibility" lifecycle is only partially wired.

### Delivery substrate

The docs describe a mailbox-capable substrate with long-lived outbound peer connections.

Today:

- the deployable path is polling mailbox delivery
- mailbox replay is best-effort
- the hub does not yet maintain long-lived peer connections, push delivery, or richer presence semantics

This is good enough for a first self-hosted loop, but still below the stronger architecture described in `docs/joins.md`.

### Result and artifact handling

Task results do come back through the hub, but artifact support is still minimal.

Today:

- inline textual results work
- larger relay-backed artifact handling is still mostly a placeholder shape
- there is no complete end-to-end shared artifact pipeline behind AgentPod references yet

### Managed join lifecycle

The managed join shape exists, but the trust chain is incomplete.

Today:

- the plugin can resolve a managed profile from `join_url`
- the hub can mint and renew bearer tokens
- revocation storage exists

But the implementation still does not fully enforce the signed-manifest and proof-validation model described in the docs.

## Missing

### Signed managed join verification

The v0.1 docs require:

- signed join manifests
- signature verification
- expiry validation
- proof-bearing token exchange bound to peer identity

The current code fetches the manifest shape and exchanges tokens, but does not yet validate the full trust chain end-to-end.

### Strict policy intersection

The docs say effective execution policy must be the strict intersection of:

- owner policy
- published service defaults
- request policy

The current execution guard still behaves like override/fallback resolution, not a strict intersection model.

### Presence and heartbeat

The docs describe peer presence and `last_seen_at` as runtime information.

The current implementation does not yet run a real heartbeat/presence system, and `last_seen_at` is not maintained by a live presence loop.

### Complete public-card lifecycle

The docs include:

- publication visibility rules
- public-card withdrawal
- verified public-card lifecycle

The current hub exposes projection routes, but the complete lifecycle, including withdrawal and publication-state-driven projection updates, is not finished.

### Full relay-backed artifact pipeline

The docs put relay-backed artifacts inside v0.1 scope.

The current implementation does not yet provide a complete:

- artifact upload/storage path
- artifact reference publication path
- artifact return path from inbound execution

### OpenAgents-backed substrate integration

The docs describe AgentPod as a thin layer over an OpenAgents-backed discovery/task/artifact substrate.

The current implementation has the AgentPod-facing contract and a deployable mailbox flow, but it does not yet wire the hub to a real OpenAgents-backed discovery and artifact backend.

## Practical interpretation

If your bar is:

- "Can multiple OpenClaw instances join a shared hub and collaborate on demand?"

Then the answer is `yes`, for a basic self-hosted flow.

If your bar is:

- "Does this repository fully satisfy every MVP v0.1 requirement written in the docs?"

Then the answer is `not yet`.

The biggest remaining gaps are:

- managed join signature and proof validation
- strict runtime policy intersection
- real presence/heartbeat
- full publication-to-public-card lifecycle
- relay-backed artifact support
- deeper OpenAgents-backed substrate wiring
