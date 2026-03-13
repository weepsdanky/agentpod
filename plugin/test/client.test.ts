import { describe, expect, it, vi } from "vitest";

import type { CapabilityManifest, PeerProfile, TaskRequest, TaskResult, TaskUpdate } from "../types/agentpod";
import { createAgentPodClient } from "../client";
import { generateLocalPeerIdentity } from "../identity/keys";

describe("AgentPod client", () => {
  it("publishes a manifest through the hub transport", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    const client = createAgentPodClient({ request, subscribe: vi.fn() });

    const manifest: CapabilityManifest = {
      version: "0.1",
      peer_id: "peer_123",
      issued_at: "2026-03-12T10:40:00Z",
      expires_at: "2026-04-12T10:40:00Z",
      signature: "base64...",
      services: []
    };

    await client.publishManifest(manifest);

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/capabilities/publish",
      body: { manifest }
    });
  });

  it("lists peers as AgentPod peer profiles", async () => {
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
    const request = vi.fn().mockResolvedValue({ peers });
    const client = createAgentPodClient({ request, subscribe: vi.fn() });

    await expect(client.listPeers()).resolves.toEqual(peers);
  });

  it("delegates tasks through the hub transport", async () => {
    const request = vi.fn().mockResolvedValue({
      task_id: "task_123",
      status: "queued"
    });
    const client = createAgentPodClient({ request, subscribe: vi.fn() });

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

    await expect(client.delegate(task)).resolves.toEqual({
      task_id: "task_123",
      status: "queued"
    });

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/tasks/delegate",
      body: { task }
    });
  });

  it("maps subscribed task events into AgentPod shapes", async () => {
    const subscribe = vi.fn().mockImplementation(async (_path, onEvent) => {
      const update: TaskUpdate = {
        version: "0.1",
        task_id: "task_123",
        state: "running",
        message: "Reviewing the draft spec",
        progress: 0.5,
        timestamp: "2026-03-12T10:45:00Z"
      };
      const result: TaskResult = {
        version: "0.1",
        task_id: "task_123",
        status: "completed",
        output: {
          text: "Here is a first-pass MVP structure."
        },
        artifacts: [],
        execution_summary: {
          used_tools: ["read_file"],
          used_network: false
        }
      };

      onEvent({ kind: "update", data: update });
      onEvent({ kind: "result", data: result });

      return () => undefined;
    });

    const client = createAgentPodClient({ request: vi.fn(), subscribe });
    const events: Array<TaskUpdate | TaskResult> = [];

    await client.subscribeTask("task_123", (event) => {
      events.push(event);
    });

    expect(subscribe).toHaveBeenCalledWith("/v1/tasks/task_123/events", expect.any(Function));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ task_id: "task_123", state: "running" });
    expect(events[1]).toMatchObject({ task_id: "task_123", status: "completed" });
  });

  it("claims inbound mailbox tasks for a specific peer", async () => {
    const task: TaskRequest = {
      version: "0.1",
      task_id: "task_mailbox_123",
      target_peer_id: "peer_remote",
      service: "product_brainstorm",
      input: {
        payload: { text: "Help from the mailbox" },
        attachments: []
      },
      delivery: {
        reply: "origin_session",
        artifacts: "inline_only"
      }
    };
    const request = vi.fn().mockResolvedValue({ task });
    const client = createAgentPodClient({ request, subscribe: vi.fn() });
    const identity = generateLocalPeerIdentity();

    await expect(client.claimInboundTask(identity)).resolves.toEqual(task);
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/runtime/mailbox/claim",
      body: {
        peer_id: identity.peer_id,
        auth: expect.objectContaining({
          peer_id: identity.peer_id,
          public_key: identity.public_key,
          key_fingerprint: identity.key_fingerprint,
          signature: expect.any(String)
        })
      }
    });
  });

  it("publishes runtime task events back to the hub", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    const client = createAgentPodClient({ request, subscribe: vi.fn() });
    const identity = generateLocalPeerIdentity();
    const event: TaskUpdate = {
      version: "0.1",
      task_id: "task_123",
      state: "running",
      message: "Spawned local subagent session",
      progress: 0.1,
      timestamp: "2026-03-13T09:00:00Z"
    };

    await client.publishTaskEvent("task_123", event, identity);
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/runtime/tasks/event",
      body: {
        peer_id: identity.peer_id,
        task_id: "task_123",
        event: {
          kind: "update",
          data: event
        },
        auth: expect.objectContaining({
          peer_id: identity.peer_id,
          public_key: identity.public_key,
          key_fingerprint: identity.key_fingerprint,
          signature: expect.any(String)
        })
      }
    });
  });
});
