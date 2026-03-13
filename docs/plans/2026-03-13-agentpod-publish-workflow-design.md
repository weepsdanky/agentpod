# AgentPod Publish Workflow Design

## Summary

This design implements the first missing owner-facing publishing path for AgentPod v0.1:

- read local `AGENTPOD.md`
- compile it into a `CapabilityManifest`
- publish through the existing AgentPod client seam
- expose the flow through deterministic slash/CLI commands

This intentionally does not attempt to solve the full OpenAgents-backed remote execution path yet. The goal is to turn the documented publication story into a real local workflow before expanding substrate complexity.

## Why This Slice First

The current repo already has:

- `AGENTPOD.md` validation and compilation
- background-service publication seam
- hub publication endpoint
- plugin command and tool registration

What is missing is the connection between them. Implementing this slice gives the project a real owner workflow and removes one of the clearest doc/runtime mismatches without forcing a large substrate rewrite.

## Chosen Approach

Use the existing `BackgroundService` as the single owner-facing orchestration point.

The publish flow will be:

1. owner calls `/agentpod publish` or `openclaw agentpod publish`
2. plugin reads a configured local source document path
3. plugin compiles the markdown with the local peer identity
4. plugin publishes the resulting manifest through the existing client seam
5. plugin refreshes peer cache as it already does today
6. command returns a small AgentPod-shaped success payload

## Alternatives Considered

### 1. Publish only pre-built manifests

Pros:
- smallest code change

Cons:
- keeps docs and runtime inconsistent
- does not make `AGENTPOD.md` the real source of truth

### 2. Compile inside commands

Pros:
- direct wiring

Cons:
- duplicates logic across slash/CLI/gateway
- weakens service boundary

### 3. Compile inside background service

Pros:
- keeps owner workflow centralized
- easiest place to reuse identity and state
- matches existing service-oriented plugin shape

Cons:
- requires extending service options/config a bit

Recommended: option 3.

## Data Flow

- config gains an `agentpodDocPath` field, defaulting to `AGENTPOD.md`
- service reads the source document from disk
- compiler uses local identity plus current timestamps to build a manifest
- service calls existing `publishManifest(manifest)` path
- command returns the manifest summary and peer-cache refresh result

## Error Handling

- missing source doc: return a clear error
- invalid source doc: surface compiler validation error
- no client configured: keep existing publication failure semantics
- publish transport failure: bubble the transport error

## Testing

Add TDD coverage for:

- slash/CLI publish command availability
- service-level publish from `AGENTPOD.md`
- compile failure blocking publication
- identity fields being carried into the published manifest

## Non-Goals

- auto-generation of `AGENTPOD.md`
- refresh schedules
- managed-join signature verification
- real remote execution or mailbox transport
