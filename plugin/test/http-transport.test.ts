import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentPodClient, createHttpAgentPodTransport } from "../client";
import { generateLocalPeerIdentity } from "../identity/keys";
import { startHubServer, type RunningHubServer } from "../../hub/index";
import type { TaskResult, TaskUpdate } from "../types/agentpod";

describe("AgentPod HTTP transport", () => {
  let server: RunningHubServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  it("uses HTTP requests and streamed task events against a running hub", async () => {
    server = await startHubServer({
      bindHost: "127.0.0.1",
      port: 0,
      mode: "managed",
      networkId: "agentpod-public",
      directoryUrl: "http://127.0.0.1/directory",
      substrateUrl: "ws://127.0.0.1/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: [],
      peerProfiles: [
        {
          peer_id: "peer_remote",
          network_id: "agentpod-public",
          display_name: "Remote Peer",
          owner_label: "remote-lab",
          public_key: "base64...",
          key_fingerprint: "sha256:remote...",
          trust_signals: ["operator_verified"],
          last_seen_at: "2026-03-12T10:54:00Z"
        }
      ]
    });

    const client = createAgentPodClient(
      createHttpAgentPodTransport({
        baseUrl: server.baseUrl
      })
    );

    const peers = await client.listPeers();
    const events: Array<TaskUpdate | TaskResult> = [];
    const unsubscribe = await client.subscribeTask("task_http_123", (event) => {
      events.push(event);
    });
    const handle = await client.delegate({
      version: "0.1",
      task_id: "task_http_123",
      service: "product_brainstorm",
      input: {
        payload: {
          text: "Help structure a local dev loop"
        },
        attachments: []
      },
      delivery: {
        reply: "origin_session",
        artifacts: "inline_only"
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    await unsubscribe();

    expect(peers).toHaveLength(1);
    expect(handle).toEqual({
      task_id: "task_http_123",
      status: "queued"
    });
    expect(events).toEqual([
      {
        version: "0.1",
        task_id: "task_http_123",
        state: "running",
        message: "Remote peer is working",
        progress: 0.5,
        timestamp: "2026-03-12T10:45:00Z"
      },
      {
        version: "0.1",
        task_id: "task_http_123",
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
  });

  it("adds bearer auth headers when configured", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    }));
    const client = createAgentPodClient(
      createHttpAgentPodTransport({
        baseUrl: "https://agentpod.example.com",
        bearerToken: "runtime-secret",
        fetchImpl: fetchImpl as unknown as typeof fetch
      })
    );
    const identity = generateLocalPeerIdentity();

    await client.claimInboundTask(identity);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://agentpod.example.com/v1/runtime/mailbox/claim",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer runtime-secret"
        })
      })
    );
  });
});
