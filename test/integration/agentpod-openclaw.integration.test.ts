import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAgentPodClient } from "../../plugin/client";
import { createBackgroundService } from "../../plugin/service/background";
import type {
  CapabilityManifest,
  PeerProfile,
  TaskRequest,
  TaskResult,
  TaskUpdate
} from "../../plugin/types/agentpod";
import { createFakeAgentPodTransport } from "./fixtures/fake-substrate-server";

describe("AgentPod integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agentpod-integration-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("runs a managed join -> publish -> peers -> delegate -> result flow in memory", async () => {
    const peer: PeerProfile = {
      peer_id: "peer_remote",
      network_id: "agentpod-public",
      display_name: "Remote Peer",
      owner_label: "remote-lab",
      public_key: "base64...",
      key_fingerprint: "sha256:remote...",
      trust_signals: ["operator_verified"],
      last_seen_at: "2026-03-12T10:54:00Z"
    };
    const transport = createFakeAgentPodTransport({
      networkId: "agentpod-public",
      peers: [peer]
    });
    const client = createAgentPodClient(transport);
    const service = createBackgroundService({
      statePath: join(tempDir, "state.json"),
      fetchJoinManifest: transport.fetchJoinManifest,
      client
    });
    const manifest: CapabilityManifest = {
      version: "0.1",
      peer_id: "peer_local",
      issued_at: "2026-03-12T10:40:00Z",
      expires_at: "2026-04-12T10:40:00Z",
      signature: "base64...",
      services: [
        {
          id: "product_brainstorm",
          summary: "Brainstorm product directions.",
          io: {
            payload_types: ["text/plain"],
            attachment_types: ["application/pdf"],
            result_types: ["text/markdown"]
          }
        }
      ]
    };
    const task: TaskRequest = {
      version: "0.1",
      task_id: "task_123",
      service: "product_brainstorm",
      input: {
        payload: { text: "Help brainstorm the MVP" },
        attachments: []
      },
      delivery: {
        reply: "origin_session",
        artifacts: "inline_only"
      }
    };

    await service.start("public", {
      mode: "managed",
      join_url: "https://agentpod.ai/networks/public"
    });

    const resolved = service.snapshot().resolvedProfile;
    expect(resolved).toMatchObject({
      mode: "managed",
      network_id: "agentpod-public"
    });

    const events: Array<TaskUpdate | TaskResult> = [];
    await service.subscribeTask(task.task_id, (event) => {
      events.push(event);
    });

    const peers = await service.publishManifest(manifest);
    const handle = await service.delegateTask(task);

    expect(peers).toEqual([peer]);
    expect(service.snapshot().peers).toEqual([peer]);
    expect(handle).toEqual({
      task_id: "task_123",
      status: "queued"
    });
    expect(events).toEqual([
      {
        version: "0.1",
        task_id: "task_123",
        state: "running",
        message: "Remote peer is working",
        progress: 0.5,
        timestamp: "2026-03-12T10:45:00Z"
      },
      {
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
      }
    ]);

    expect(transport.publishedManifests()).toEqual([manifest]);
  });

  it("resolves private join via base_url while keeping one active profile", async () => {
    const transport = createFakeAgentPodTransport({
      networkId: "team-a",
      peers: []
    });
    const service = createBackgroundService({
      statePath: join(tempDir, "private-state.json"),
      fetchJoinManifest: transport.fetchJoinManifest,
      client: createAgentPodClient(transport)
    });

    const resolved = await service.start("team-a", {
      mode: "private",
      network_id: "team-a",
      base_url: "https://agentpod.internal.example.com"
    });

    expect(resolved).toMatchObject({
      mode: "private",
      network_id: "team-a",
      directory_url: "https://agentpod.internal.example.com/directory",
      substrate_url: "wss://agentpod.internal.example.com/substrate"
    });
  });
});
