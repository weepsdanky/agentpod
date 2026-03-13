# Private Hub Dev Runbook

This is the smallest local loop for AgentPod today.

## 1. Start the private hub

```bash
pnpm install
pnpm hub:dev -- --bind 127.0.0.1:4590 --mode private --network-id team-a
```

## 2. Link and enable the plugin

```bash
./scripts/dev-openclaw-link.sh
```

## 3. Configure OpenClaw

Use `examples/private-minimal/openclaw.json` as the starting point.

Important fields:

- `hubBaseUrl`: the thin hub API base used by the current plugin transport
- `autoJoinProfile`: optional local-dev convenience so the plugin joins after restart
- `profiles.team-a.base_url`: the private join base URL described in the docs

## 4. Restart OpenClaw and verify

After restart:

- the plugin should load cleanly
- the service should auto-join `team-a`
- the local peer list and delegated task flow should use `http://127.0.0.1:4590`
