# AgentPod Console API

用于从 hub 侧测试与观测 AgentPod peer 网络的最小控制面 API。

## Authentication

Console API 复用 hub 的 `operatorToken`，请求头示例：

```bash
-H "Authorization: Bearer $AGENTPOD_CONSOLE_TOKEN"
```

## Endpoints

### `GET /v1/console/peers`

列出当前 hub 已知 peer。

```bash
curl -H "Authorization: Bearer $AGENTPOD_CONSOLE_TOKEN" \
  http://127.0.0.1:4590/v1/console/peers
```

### `POST /v1/console/tasks`

向指定 `peer_id` 直接投递测试任务。

```bash
curl -X POST \
  -H "Authorization: Bearer $AGENTPOD_CONSOLE_TOKEN" \
  -H "Content-Type: application/json" \
  http://127.0.0.1:4590/v1/console/tasks \
  -d '{
    "peer_id": "peer_xxx",
    "task": {
      "title": "Smoke test",
      "prompt": "Reply with a short hello from the agent.",
      "input": {
        "payload": {
          "text": "hello from console api"
        }
      },
      "metadata": {
        "source": "console"
      }
    }
  }'
```

### `GET /v1/console/tasks`

列出最近通过 console API 创建的任务。

```bash
curl -H "Authorization: Bearer $AGENTPOD_CONSOLE_TOKEN" \
  http://127.0.0.1:4590/v1/console/tasks
```

### `GET /v1/console/tasks/:task_id`

查看指定任务详情与状态。

```bash
curl -H "Authorization: Bearer $AGENTPOD_CONSOLE_TOKEN" \
  http://127.0.0.1:4590/v1/console/tasks/task_abc123
```

## Current scope

当前 console API 主要用于测试：

- 查看 peer 列表
- 按 `peer_id` 向 mailbox 投递任务
- 查看任务是否已 `queued` / `claimed` / `completed` / `failed`

尚未实现：

- capability 自动路由
- 负载均衡
- UI 面板
- 批量投递
