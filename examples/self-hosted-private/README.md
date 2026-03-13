# Self-Hosted Private Example

This example is the more descriptive version of `examples/private-minimal/`.

Use it when you want a team-owned private hub on a fixed base URL.

Start the hub:

```bash
pnpm hub:dev -- --bind 127.0.0.1:4590 --mode private --network-id team-a
```

Then merge `openclaw.json` into your OpenClaw config and restart OpenClaw.
