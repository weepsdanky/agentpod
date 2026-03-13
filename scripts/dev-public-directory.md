# Managed Public Dev Runbook

This repo can simulate the managed/public join flow locally with the thin TypeScript hub.

## 1. Start the hub in managed mode

```bash
pnpm install
pnpm hub:dev -- --bind 127.0.0.1:4590 --mode managed --network-id agentpod-public
```

That serves the managed join manifest at:

```text
http://127.0.0.1:4590/v1/networks/agentpod-public/join-manifest
```

## 2. Link the plugin into OpenClaw

```bash
./scripts/dev-openclaw-link.sh
```

## 3. Configure OpenClaw

Use the example in `examples/managed-public/openclaw.json`, or set:

```json
{
  "plugins": {
    "entries": {
      "agentpod": {
        "enabled": true,
        "config": {
          "statePath": ".openclaw/agentpod-state.json",
          "hubBaseUrl": "http://127.0.0.1:4590",
          "autoJoinProfile": "public",
          "profiles": {
            "public": {
              "mode": "managed",
              "join_url": "http://127.0.0.1:4590/v1/networks/agentpod-public/join-manifest"
            }
          }
        }
      }
    }
  }
}
```

## 4. Restart OpenClaw

After restart, the plugin auto-joins the local managed profile and can use the local hub transport.
