# Deploy AgentPod Hub with Docker

This guide runs the AgentPod hub in Docker for a more stable background process during OpenClaw peer-network testing.

## Build

```bash
cd /root/.openclaw/workspace/tmp/agentpod
docker build -t agentpod-hub:local .
```

## Run

```bash
docker run -d \
  --name agentpod-hub \
  --restart unless-stopped \
  -p 4590:4590 \
  agentpod-hub:local
```

## Verify

```bash
docker ps
curl http://127.0.0.1:4590/v1/peers
curl -H "Authorization: Bearer agentpod-local-operator-token" \
  http://127.0.0.1:4590/v1/console/peers
```

## Logs

```bash
docker logs -f agentpod-hub
```

## Stop / Remove

```bash
docker stop agentpod-hub
docker rm agentpod-hub
```

## Public-network note

If other machines need to join through this hub:

- publish TCP `4590`
- open your cloud firewall / security group
- have peers join with the host IP instead of `127.0.0.1`

Example:

```bash
openclaw agentpod join team-a --base-url http://43.131.3.244:4590 --network-id team-a
```
