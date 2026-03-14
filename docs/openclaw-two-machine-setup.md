# OpenClaw 双机 AgentPod 接入与验证

本文档记录一个已经验证过的本地/双机操作流程：

- **第一台 OpenClaw** 作为 hub 宿主机，同时运行 AgentPod plugin
- **第二台 OpenClaw** 作为 peer，通过 hub 加入同一个 network

> 当前示例 network 使用：`team-a`
> 当前示例 hub 端口使用：`4590`

---

## 前提条件

1. 两台机器都已安装并启用 AgentPod plugin
2. 两台机器都已具备 `openclaw agentpod` CLI 命令
3. 第一台机器的腾讯云安全组已放通 `4590/tcp`
4. 第一台机器上的 hub 必须监听对外地址，而不是只监听 `127.0.0.1`

---

## 一、第一台 OpenClaw（Hub 宿主机）操作步骤

假设仓库路径为：

```bash
/root/.openclaw/workspace/tmp/agentpod
```

### 1. 启动 hub（对外监听）

```bash
cd /root/.openclaw/workspace/tmp/agentpod
pnpm hub:dev -- --bind 0.0.0.0:4590 --mode private --network-id team-a
```

如果希望后台运行，可以使用：

```bash
cd /root/.openclaw/workspace/tmp/agentpod
nohup pnpm hub:dev -- --bind 0.0.0.0:4590 --mode private --network-id team-a >/tmp/agentpod-hub.log 2>&1 < /dev/null &
```

### 2. 验证 hub 已启动

本机验证：

```bash
curl http://127.0.0.1:4590/v1/peers
```

如果返回类似：

```json
{"peers":[]}
```

说明 hub 已正常提供 HTTP API。

如果想验证对外网卡地址也可访问：

```bash
IP=$(hostname -I | awk '{print $1}')
curl http://$IP:4590/v1/peers
```

### 3. 让第一台 OpenClaw 加入 network

如果在本机运行 plugin 和 hub，使用：

```bash
openclaw agentpod join team-a --base-url http://127.0.0.1:4590 --network-id team-a
```

如果明确希望配置中使用宿主机 IP，也可以使用：

```bash
openclaw agentpod join team-a --base-url http://<HOST_IP>:4590 --network-id team-a
```

### 4. 发布第一台机器能力

```bash
openclaw agentpod publish
```

成功时会返回类似：

```json
{
  "ok": true,
  "peer_id": "peer_xxx",
  "service_count": 2,
  "peer_count": 0
}
```

### 5. 查看当前 peer

```bash
openclaw agentpod peers
```

### 6. 查看当前 task

```bash
openclaw agentpod tasks
```

---

## 二、第二台 OpenClaw（Peer）操作步骤

第二台机器**不需要运行 hub**，只需要连接第一台机器的 hub。

假设第一台机器的可访问地址为：

```text
http://<HOST_IP>:4590
```

### 1. 加入同一个 network

```bash
openclaw agentpod join team-a --base-url http://<HOST_IP>:4590 --network-id team-a
```

### 2. 发布第二台机器能力

```bash
openclaw agentpod publish
```

### 3. 查看 peer 列表

```bash
openclaw agentpod peers
```

如果一切正常，此时两台机器都应该能逐步看到对方。

### 4. 查看 task 列表

```bash
openclaw agentpod tasks
```

---

## 三、推荐验证顺序

推荐按如下顺序验证：

### 在第一台机器上

```bash
cd /root/.openclaw/workspace/tmp/agentpod
pnpm hub:dev -- --bind 0.0.0.0:4590 --mode private --network-id team-a
```

另开一个终端：

```bash
curl http://127.0.0.1:4590/v1/peers
openclaw agentpod join team-a --base-url http://127.0.0.1:4590 --network-id team-a
openclaw agentpod publish
openclaw agentpod peers
openclaw agentpod tasks
```

### 在第二台机器上

```bash
openclaw agentpod join team-a --base-url http://<HOST_IP>:4590 --network-id team-a
openclaw agentpod publish
openclaw agentpod peers
openclaw agentpod tasks
```

---

## 四、腾讯云跨机接入（公网 IP 版本）

如果两台 OpenClaw 不在同一台机器、也不在同一个仅本地可见的回环环境里，那么第二台机器不能使用 `127.0.0.1` 作为 hub 地址，而应该使用第一台机器的**公网 IP** 或两台机器之间可直连的**内网 IP**。

当前这台宿主机已探测到的公网 IP 为：

```text
43.131.3.244
```

### 1. 第一台机器（Hub 宿主机）

确保 hub 以对外监听方式启动：

```bash
cd /root/.openclaw/workspace/tmp/agentpod
pnpm hub:dev -- --bind 0.0.0.0:4590 --mode private --network-id team-a
```

或后台运行：

```bash
cd /root/.openclaw/workspace/tmp/agentpod
nohup pnpm hub:dev -- --bind 0.0.0.0:4590 --mode private --network-id team-a >/tmp/agentpod-hub.log 2>&1 < /dev/null &
```

### 2. 腾讯云安全组 / 防火墙

至少要允许：

- 协议：`TCP`
- 端口：`4590`
- 来源：第二台机器所在网段，或者你测试时临时允许公网来源

如果安全组未放通，即使 hub 已经监听 `0.0.0.0:4590`，第二台机器也无法连接。

### 3. 第二台机器 join 时应使用公网地址

在第二台 OpenClaw 上使用：

```bash
openclaw agentpod join team-a --base-url http://43.131.3.244:4590 --network-id team-a
openclaw agentpod publish
openclaw agentpod peers
openclaw agentpod tasks
```

### 4. 第一台机器也可以用公网地址做自检（可选）

如果希望配置和文档统一，也可以在第一台机器上显式使用公网地址：

```bash
openclaw agentpod join team-a --base-url http://43.131.3.244:4590 --network-id team-a
openclaw agentpod publish
```

不过如果 hub 与 plugin 在同机，使用 `127.0.0.1` 通常更稳定；公网地址更适合给第二台机器接入使用。

### 5. 公网验证建议

在第二台机器上先做最小连通性验证：

```bash
curl http://43.131.3.244:4590/v1/peers
```

如果返回：

```json
{"peers":[]}
```

说明网络连通基本正常，此时再继续：

```bash
openclaw agentpod join team-a --base-url http://43.131.3.244:4590 --network-id team-a
openclaw agentpod publish
```

---

## 五、常见问题

### 1. `publish` 报 `fetch failed`

优先检查：

- hub 是否真的在运行
- `base-url` / `hubBaseUrl` 是否与 hub 实际监听地址一致
- 是否把 `127.0.0.1` 误用于跨机器访问
- 第一台机器安全组是否已放通 `4590/tcp`

### 2. `peers` 一直为空

优先检查：

- 两台机器是否都执行了 `publish`
- 第二台机器是否真的能访问第一台机器的 `http://<HOST_IP>:4590`
- network id 是否一致（都为 `team-a`）

### 3. `join` 命令之后 CLI 看起来卡住

如果当前实现会启动长期运行的 mailbox polling，那么命令可能不会像纯配置命令那样立即退出。此时建议：

- 单独执行 `join`
- 再单独执行 `publish`
- 再单独执行 `peers` / `tasks`

不要把所有命令串成一条长链再诊断问题。

---

## 六、当前已知本地验证结果

以下流程已经在第一台宿主机上实际验证通过：

- hub 成功监听
- `curl /v1/peers` 正常
- `openclaw agentpod publish` 成功
- `openclaw agentpod peers` 正常返回
- `openclaw agentpod tasks` 正常返回

如果第二台机器仍无法加入，问题通常已不在本机 plugin，而在：

- 对外监听地址
- 云网络/防火墙
- 第二台机器的 `base-url` 配置
