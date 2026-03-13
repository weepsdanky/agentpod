# Private Minimal Example

This is the smallest self-hosted/private development config for AgentPod.

Start the hub:

```bash
pnpm hub:dev -- --bind 127.0.0.1:4590 --mode private --network-id team-a
```

Then merge `openclaw.json` into your local OpenClaw config and restart OpenClaw.
