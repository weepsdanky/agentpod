import { describe, expect, it, vi } from "vitest";

import { createDelegateTool } from "../tools/delegate";
import { createPeersTool } from "../tools/peers";
import { createTasksTool } from "../tools/tasks";
import { createTaskRegistry } from "../tasks/registry";
import type { PeerProfile, TaskRequest } from "../types/agentpod";

describe("AgentPod tools", () => {
  it("agentpod_peers returns cached peer metadata", async () => {
    const peers: PeerProfile[] = [
      {
        peer_id: "peer_123",
        network_id: "agentpod-public",
        display_name: "Design Peer",
        owner_label: "mark-lab",
        public_key: "base64...",
        key_fingerprint: "sha256:abcd...",
        trust_signals: ["operator_verified"],
        last_seen_at: "2026-03-12T10:54:00Z"
      }
    ];

    const peersTool = createPeersTool({
      snapshot: () => ({ peers })
    });

    await expect(peersTool()).resolves.toEqual(peers);
  });

  it("agentpod_delegate returns quickly with a task handle", async () => {
    const registry = createTaskRegistry();
    const delegate = createDelegateTool({
      client: {
        delegate: vi.fn(async () => ({
          task_id: "task_123",
          status: "queued"
        }))
      },
      registry
    });
    const task: TaskRequest = {
      version: "0.1",
      task_id: "task_123",
      service: "product_brainstorm",
      input: {
        payload: { text: "Help brainstorm the MVP" },
        attachments: []
      },
      policy: {
        tool_use: "ask",
        followups: "deny",
        result_detail: "summary"
      },
      delivery: {
        reply: "origin_session",
        artifacts: "inline_only"
      }
    };

    await expect(delegate(task)).resolves.toEqual({
      task_id: "task_123",
      status: "queued"
    });
    expect(registry.list()).toMatchObject([
      {
        task_id: "task_123",
        status: "queued",
        direction: "outbound"
      }
    ]);
  });

  it("agentpod_tasks returns local task statuses", async () => {
    const registry = createTaskRegistry();
    registry.recordOutbound({
      task_id: "task_123",
      status: "queued"
    });

    const tasksTool = createTasksTool(registry);

    await expect(tasksTool()).resolves.toMatchObject([
      {
        task_id: "task_123",
        status: "queued"
      }
    ]);
  });
});
