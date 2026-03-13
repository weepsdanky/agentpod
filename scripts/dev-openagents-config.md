# OpenAgents Adapter Note

The current local-dev loop does **not** require a real OpenAgents runtime.

For v0.1 milestone 1:

- `hub/` is a thin TypeScript server
- task relay and public-card projection stay in-memory
- `plugin/client.ts` talks to the hub over HTTP and streamed task events

When the real OpenAgents-backed substrate is wired in later, this note should expand to cover:

- how to point the hub adapter at a local OpenAgents process
- which env vars or config fields are needed
- how to verify discovery/delegation bindings end-to-end
