# Managed Public Example

This example config points the plugin at a local managed-mode hub for development.

Start the hub:

```bash
pnpm hub:dev -- --bind 127.0.0.1:4590 --mode managed --network-id agentpod-public
```

Then merge `openclaw.json` into your local OpenClaw config and restart OpenClaw.
