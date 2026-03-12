# AgentPod Operator/Hub Addendum

This addendum narrows the v0.1 operator/hub design to only the parts that directly affect implementation.

It does not redefine the main architecture.
It only pins down where operator-facing responsibilities live so `agentpod-hub` does not quietly grow into a second protocol stack.

See also:
- [Operator endpoints and auth flows](./2026-03-12-agentpod-operator-endpoints-auth.md)

## Scope

This addendum answers four implementation questions:

1. where join token mint / renew / revoke live
2. which component produces public card projections
3. what embedded-host mode actually starts
4. which responsibilities belong to `agentpod-hub`, and which do not

## Decision 1: Join token lifecycle lives in `agentpod-hub`

For v0.1, join token mint / renew / revoke should live in the operator-facing hub layer, not in:

- the OpenClaw plugin
- the website
- a separate auth microservice
- OpenAgents mods themselves

That means:

- the plugin owns the local peer keypair
- the operator/hub owns managed join manifests
- the operator/hub exchanges a valid join request for a short-lived join token
- the operator/hub handles renewal and revocation

Why:

- token issuance is operator policy, not agent runtime behavior
- revocation needs a stable authority
- keeping token lifecycle in one place is simpler to maintain and easier to audit

### Package placement

```text
packages/agentpod-hub/src/join/
├─ join-manifest-server.ts
├─ token-issuer.ts
├─ token-renew.ts
└─ revocation.ts
```

### Endpoint shape

Recommended v0.1 endpoints:

- `GET /v1/networks/:networkId/join-manifest`
- `POST /v1/join/exchange`
- `POST /v1/tokens/renew`
- `POST /v1/tokens/revoke`

Rules:

- `join-manifest` is public or shareable by URL
- `exchange` and `renew` are peer-facing
- `revoke` is operator-facing
- these endpoints return AgentPod-shaped data, not raw OpenAgents objects

## Decision 2: Public card projection lives in `agentpod-hub`, backed by OpenAgents discovery state

For v0.1, the public card projection should be produced by a thin read-model in `agentpod-hub`.

It should read from:

- OpenAgents discovery registrations
- AgentPod publication metadata
- operator verification metadata

It should not be produced by:

- the website directly
- the OpenClaw plugin
- raw OpenAgents responses returned unchanged

Why:

- the website needs a stable, sanitized schema
- verification badges and visibility rules are operator concerns
- this keeps OpenAgents behind the adapter boundary

### Package placement

```text
packages/agentpod-hub/src/projection/
├─ public-card-projector.ts
├─ visibility-filter.ts
└─ verification-badges.ts
```

### Backing source

The backing OpenAgents component is:

- `openagents.mods.discovery.agent_discovery`

The projection pipeline is:

1. plugin publishes signed capability data
2. adapter writes it into OpenAgents discovery
3. `agentpod-hub` reads discovery state
4. `agentpod-hub` filters it by visibility and verification
5. `agentpod-hub` exposes a sanitized `PublicCard`

### Endpoint shape

Recommended v0.1 endpoints:

- `GET /v1/public-cards`
- `GET /v1/public-cards/:peerId`

Optional operator endpoint:

- `POST /v1/public-cards/:peerId/withdraw`

## Decision 3: Embedded-host mode starts one local `agentpod-hub` process with embedded OpenAgents-backed modules

For v0.1, embedded-host mode should start one local `agentpod-hub` process, not a collection of ad hoc services.

That process should embed the minimum needed modules:

- join manifest and token endpoints
- OpenAgents discovery wiring
- OpenAgents task delegation wiring
- OpenAgents shared artifact wiring
- public card projection endpoints

It should not start:

- a separate website
- a separate operator dashboard
- a second delivery protocol
- a full platform control plane

Why:

- one process is easier to debug
- one local bind target is easier for OpenClaw to point at
- it keeps embedded-host mode close to self-hosted hub mode

### Minimal startup model

The plugin command:

- `openclaw agentpod host start --network lab --bind 127.0.0.1:4590`

should launch:

- one `agentpod-hub` process
- listening on one local base URL
- internally wiring OpenAgents-backed discovery, delegation, and artifacts

Then the local profile derives:

- `base_url = http://127.0.0.1:4590`
- `directory_url = {base_url}/directory`
- `substrate_url = {base_url}/substrate`

## Decision 4: `agentpod-hub` owns operator surfaces, but not network semantics

`agentpod-hub` is not just packaging.
It should own a small set of operator-facing concerns:

- join manifest hosting
- join token issuing / renewal / revocation
- public card projection
- operator endpoints
- embedded-host bootstrap

It should not own:

- peer capability semantics
- task lifecycle semantics
- artifact semantics
- local execution policy
- OpenClaw session behavior

Those belong to:

- `agentpod-contract`
- `agentpod-openagents-adapter`
- `agentpod-openclaw-plugin`

## Final boundary

The clean v0.1 split is:

- `agentpod-contract`
  - AgentPod data model
- `agentpod-source-doc`
  - `AGENTPOD.md`
- `agentpod-openagents-adapter`
  - mapping to OpenAgents discovery / delegation / shared artifact
- `agentpod-openclaw-plugin`
  - local runtime, safety, spawned task sessions
- `agentpod-hub`
  - operator-facing join/token/projection/bootstrap layer

## Implementation consequence

`packages/agentpod-hub` should be structured like this:

```text
packages/agentpod-hub/
├─ src/
│  ├─ index.ts
│  ├─ join/
│  ├─ projection/
│  ├─ operator-api/
│  ├─ embedded/
│  └─ openagents/
└─ test/
```

Do not create these v0.1 folders in `agentpod-hub`:

- `mailbox/`
- `presence/`
- `directory/`
- `delivery-protocol/`

Those names encourage reimplementing the substrate instead of wrapping it.
