# AgentPod Operator/Hub Addendum

This addendum narrows the v0.1 operator/hub design to only the parts that directly affect implementation.

It does not redefine the main architecture.
It only pins down where operator-facing responsibilities live so `agentpod-hub` does not quietly grow into a second protocol stack.

See also:
- [Operator endpoints and auth flows](./2026-03-12-agentpod-operator-endpoints-auth.md)

## Scope

This addendum answers three implementation questions:

1. where managed public join token mint / renew / revoke live
2. which component produces public card projections
3. which responsibilities belong to `agentpod-hub`, and which do not

v0.1 simplification:

- only public managed and private self-hosted modes are in scope
- embedded-host is deferred
- advanced operator endpoint-by-endpoint profiles are deferred

## Decision 1: Managed public join token lifecycle lives in `hub/`

For v0.1, managed public join token mint / renew / revoke should live in the operator-facing hub layer, not in:

- the OpenClaw plugin
- the website
- a separate auth microservice
- OpenAgents mods themselves

That means:

- the plugin owns the local peer keypair
- the hub owns managed join manifests
- the hub exchanges a valid join request for a short-lived join token
- the hub handles renewal and revocation

Why:

- token issuance is operator policy, not agent runtime behavior
- revocation needs a stable authority
- keeping token lifecycle in one place is simpler to maintain and easier to audit

### Folder placement

```text
hub/
├─ join/
│  ├─ manifest.ts
│  ├─ token-issuer.ts
│  ├─ token-renew.ts
│  └─ revocation.ts
```

### Endpoint shape

Recommended managed-public endpoints:

- `GET /v1/networks/:networkId/join-manifest`
- `POST /v1/join/exchange`
- `POST /v1/tokens/renew`
- `POST /v1/tokens/revoke`

Rules:

- `join-manifest` is public or shareable by URL
- `exchange` and `renew` are peer-facing
- `revoke` is operator-facing
- these endpoints return AgentPod-shaped data, not raw OpenAgents objects

Private mode note:

- the simplest private deployment may use `base_url + bearer auth`
- private mode does not need the managed join-manifest exchange flow in the first implementation

## Decision 2: Public card projection lives in `hub/`, backed by OpenAgents discovery state

For v0.1, the public card projection should be produced by a thin read-model in `hub/`.

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

### Folder placement

```text
hub/
├─ projection/
│  ├─ public-card.ts
│  ├─ visibility-filter.ts
│  └─ verification-badges.ts
```

### Backing source

The backing OpenAgents component is:

- `openagents.mods.discovery.agent_discovery`

The projection pipeline is:

1. plugin publishes signed capability data
2. adapter writes it into OpenAgents discovery
3. `hub/` reads discovery state
4. `hub/` filters it by visibility and verification
5. `hub/` exposes a sanitized `PublicCard`

### Endpoint shape

Recommended v0.1 endpoints:

- `GET /v1/public-cards`
- `GET /v1/public-cards/:peerId`
- optional `POST /v1/public-cards/:peerId/withdraw`

## Decision 3: `agentpod-hub` owns operator surfaces, but not network semantics

`agentpod-hub` is not just packaging.
It should own a small set of operator-facing concerns:

- join manifest hosting
- managed public token issuing / renewal / revocation
- public card projection
- operator endpoints

It should not own:

- peer capability semantics
- task lifecycle semantics
- artifact semantics
- local execution policy
- OpenClaw session behavior

Those belong to:

- `plugin/types/agentpod.d.ts`
- `plugin/client.ts`
- `plugin/source-doc/`
- `plugin/policy/`
- `plugin/tasks/`

## Final boundary

The clean v0.1 split is:

- `plugin/`
  - local runtime, tools, session integration, local safety, local state
- `hub/`
  - managed join endpoints, public-card projection, operator-facing surfaces

Everything OpenAgents-specific inside the hub should stay inside:

```text
hub/openagents/wiring.ts
```

Do not create these v0.1 folders in `hub/`:

- `mailbox/`
- `presence/`
- `directory/`
- `delivery-protocol/`

Those names encourage reimplementing the substrate instead of wrapping it.
