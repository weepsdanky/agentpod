import { afterEach, describe, expect, it } from "vitest";

import { startHubServer, type RunningHubServer } from "../index";
import { createHubRouter } from "../operator-api/routes";

describe("AgentPod hub router", () => {
  let server: RunningHubServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  it("returns signed managed join manifest metadata", async () => {
    const router = createHubRouter({
      mode: "managed",
      networkId: "agentpod-public",
      directoryUrl: "https://agentpod.ai/directory",
      substrateUrl: "wss://agentpod.ai/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: []
    });

    const response = await router.handle({
      method: "GET",
      path: "/v1/networks/agentpod-public/join-manifest"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      network_id: "agentpod-public",
      directory_url: "https://agentpod.ai/directory",
      substrate_url: "wss://agentpod.ai/substrate",
      key_id: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      signature: "manifest-signature"
    });
  });

  it("routes token exchange and renew through the join layer", async () => {
    const router = createHubRouter({
      mode: "managed",
      networkId: "agentpod-public",
      directoryUrl: "https://agentpod.ai/directory",
      substrateUrl: "wss://agentpod.ai/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: []
    });

    const exchange = await router.handle({
      method: "POST",
      path: "/v1/join/exchange",
      body: {
        network_id: "agentpod-public",
        peer_id: "peer_123",
        public_key: "base64...",
        key_fingerprint: "sha256:abcd...",
        proof: {
          signed_at: "2026-03-12T10:01:00Z",
          signature: "base64..."
        }
      }
    });

    expect(exchange.status).toBe(200);
    expect(exchange.body).toMatchObject({
      token_type: "bearer",
      access_token: expect.stringContaining("agentpod_join_tok_")
    });

    const renew = await router.handle({
      method: "POST",
      path: "/v1/tokens/renew",
      headers: {
        authorization: `Bearer ${exchange.body.access_token as string}`
      },
      body: {
        peer_id: "peer_123",
        key_fingerprint: "sha256:abcd..."
      }
    });

    expect(renew.status).toBe(200);
    expect(renew.body).toMatchObject({
      token_type: "bearer",
      access_token: expect.stringContaining("agentpod_join_tok_")
    });
    expect(renew.body.access_token).not.toBe(exchange.body.access_token);
  });

  it("projects sanitized public cards from discovery state", async () => {
    const router = createHubRouter({
      mode: "managed",
      networkId: "agentpod-public",
      directoryUrl: "https://agentpod.ai/directory",
      substrateUrl: "wss://agentpod.ai/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: [
        {
          peer_id: "peer_123",
          network_id: "agentpod-public",
          display_name: "Design Peer",
          summary: "Helps with product thinking and specs.",
          services: [
            {
              id: "product_brainstorm",
              summary: "Brainstorm product ideas"
            }
          ],
          risk_flags: ["uses_network"],
          visibility: "public",
          operator_verified: true,
          last_seen_at: "2026-03-12T10:54:00Z",
          updated_at: "2026-03-12T10:40:00Z"
        }
      ]
    });

    const response = await router.handle({
      method: "GET",
      path: "/v1/public-cards"
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      cards: [
        {
          version: "0.1",
          peer_id: "peer_123",
          network_id: "agentpod-public",
          display_name: "Design Peer",
          summary: "Helps with product thinking and specs.",
          services: [
            {
              id: "product_brainstorm",
              summary: "Brainstorm product ideas"
            }
          ],
          risk_flags: ["uses_network"],
          verified: true,
          last_seen_at: "2026-03-12T10:54:00Z",
          updated_at: "2026-03-12T10:40:00Z"
        }
      ]
    });
  });

  it("hides revoked peers from public card projection", async () => {
    const router = createHubRouter({
      mode: "managed",
      networkId: "agentpod-public",
      directoryUrl: "https://agentpod.ai/directory",
      substrateUrl: "wss://agentpod.ai/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: [
        {
          peer_id: "peer_123",
          network_id: "agentpod-public",
          display_name: "Design Peer",
          summary: "Helps with product thinking and specs.",
          services: [
            {
              id: "product_brainstorm",
              summary: "Brainstorm product ideas"
            }
          ],
          risk_flags: [],
          visibility: "public",
          operator_verified: true,
          key_fingerprint: "sha256:abcd...",
          last_seen_at: "2026-03-12T10:54:00Z",
          updated_at: "2026-03-12T10:40:00Z"
        }
      ]
    });

    const revoke = await router.handle({
      method: "POST",
      path: "/v1/tokens/revoke",
      headers: {
        authorization: "Bearer operator-secret"
      },
      body: {
        peer_id: "peer_123",
        key_fingerprint: "sha256:abcd...",
        reason: "owner-requested-rotation"
      }
    });

    expect(revoke.status).toBe(200);

    const response = await router.handle({
      method: "GET",
      path: "/v1/public-cards"
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ cards: [] });
  });

  it("lets private mode skip managed join endpoints while keeping projection surfaces", async () => {
    const router = createHubRouter({
      mode: "private",
      networkId: "team-a",
      directoryUrl: "https://agentpod.internal.example.com/directory",
      substrateUrl: "wss://agentpod.internal.example.com/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "team-a-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: [
        {
          peer_id: "peer_private",
          network_id: "team-a",
          display_name: "Private Peer",
          summary: "Private network peer.",
          services: [{ id: "draft_review", summary: "Review drafts" }],
          risk_flags: [],
          visibility: "network_only",
          operator_verified: false,
          last_seen_at: "2026-03-12T10:54:00Z",
          updated_at: "2026-03-12T10:40:00Z"
        }
      ]
    });

    const joinManifest = await router.handle({
      method: "GET",
      path: "/v1/networks/team-a/join-manifest"
    });

    expect(joinManifest.status).toBe(404);

    const exchange = await router.handle({
      method: "POST",
      path: "/v1/join/exchange",
      body: {
        network_id: "team-a",
        peer_id: "peer_private",
        public_key: "base64...",
        key_fingerprint: "sha256:private...",
        proof: {
          signed_at: "2026-03-12T10:01:00Z",
          signature: "base64..."
        }
      }
    });

    expect(exchange.status).toBe(404);

    const renew = await router.handle({
      method: "POST",
      path: "/v1/tokens/renew",
      headers: {
        authorization: "Bearer ignored"
      },
      body: {
        peer_id: "peer_private",
        key_fingerprint: "sha256:private..."
      }
    });

    expect(renew.status).toBe(404);

    const response = await router.handle({
      method: "GET",
      path: "/v1/public-cards"
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ cards: [] });
  });

  it("returns typed auth errors instead of throwing on token renew", async () => {
    const router = createHubRouter({
      mode: "managed",
      networkId: "agentpod-public",
      directoryUrl: "https://agentpod.ai/directory",
      substrateUrl: "wss://agentpod.ai/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: []
    });

    const response = await router.handle({
      method: "POST",
      path: "/v1/tokens/renew",
      body: {
        peer_id: "peer_123",
        key_fingerprint: "sha256:abcd..."
      }
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "token_expired"
    });
  });

  it("supports peer listing, manifest publication, and delegated task events", async () => {
    const router = createHubRouter({
      mode: "managed",
      networkId: "agentpod-public",
      directoryUrl: "https://agentpod.ai/directory",
      substrateUrl: "wss://agentpod.ai/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: [],
      peerProfiles: [
        {
          peer_id: "peer_123",
          network_id: "agentpod-public",
          display_name: "Design Peer",
          public_key: "base64...",
          key_fingerprint: "sha256:abcd...",
          trust_signals: ["operator_verified"],
          last_seen_at: "2026-03-12T10:54:00Z"
        }
      ]
    });

    const publish = await router.handle({
      method: "POST",
      path: "/v1/capabilities/publish",
      body: {
        manifest: {
          version: "0.1",
          peer_id: "peer_local",
          issued_at: "2026-03-12T10:40:00Z",
          expires_at: "2026-04-12T10:40:00Z",
          signature: "base64...",
          services: []
        }
      }
    });
    const peers = await router.handle({
      method: "GET",
      path: "/v1/peers"
    });
    const events: Array<{ kind: string; data: unknown }> = [];
    router.subscribeTask("task_123", (event) => {
      events.push(event);
    });
    const delegate = await router.handle({
      method: "POST",
      path: "/v1/tasks/delegate",
      body: {
        task: {
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
        }
      }
    });

    expect(publish.status).toBe(200);
    expect(router.publishedManifests()).toHaveLength(1);
    expect(peers.body).toEqual({
      peers: [
        {
          peer_id: "peer_123",
          network_id: "agentpod-public",
          display_name: "Design Peer",
          public_key: "base64...",
          key_fingerprint: "sha256:abcd...",
          trust_signals: ["operator_verified"],
          last_seen_at: "2026-03-12T10:54:00Z"
        }
      ]
    });
    expect(delegate.body).toEqual({
      task_id: "task_123",
      status: "queued"
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "update" });
    expect(events[1]).toMatchObject({ kind: "result" });
  });

  it("starts a real HTTP server that serves join manifests and task event streams", async () => {
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
      peerProfiles: []
    });

    const joinManifestResponse = await fetch(
      `${server.baseUrl}/v1/networks/agentpod-public/join-manifest`
    );
    const joinManifest = (await joinManifestResponse.json()) as Record<string, unknown>;

    expect(joinManifestResponse.status).toBe(200);
    expect(joinManifest).toMatchObject({
      network_id: "agentpod-public"
    });

    const eventsPromise = (async () => {
      const response = await fetch(`${server.baseUrl}/v1/tasks/task_server_123/events`);
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Expected event stream body");
      }

      let buffer = "";
      const events: Array<Record<string, unknown>> = [];
      while (events.length < 2) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }

        buffer += new TextDecoder().decode(chunk.value, { stream: true });
        let separatorIndex = buffer.indexOf("\n\n");
        while (separatorIndex >= 0) {
          const block = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          const line = block
            .split("\n")
            .find((candidate) => candidate.startsWith("data: "));
          if (line) {
            events.push(JSON.parse(line.slice("data: ".length)) as Record<string, unknown>);
          }
          separatorIndex = buffer.indexOf("\n\n");
        }
      }

      reader.releaseLock();
      return events;
    })();

    const delegateResponse = await fetch(`${server.baseUrl}/v1/tasks/delegate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        task: {
          version: "0.1",
          task_id: "task_server_123",
          service: "product_brainstorm",
          input: {
            payload: { text: "Plan local debug flow" },
            attachments: []
          },
          delivery: {
            reply: "origin_session",
            artifacts: "inline_only"
          }
        }
      })
    });

    expect(delegateResponse.status).toBe(200);
    await expect(eventsPromise).resolves.toEqual([
      {
        kind: "update",
        data: {
          version: "0.1",
          task_id: "task_server_123",
          state: "running",
          message: "Remote peer is working",
          progress: 0.5,
          timestamp: "2026-03-12T10:45:00Z"
        }
      },
      {
        kind: "result",
        data: {
          version: "0.1",
          task_id: "task_server_123",
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
      }
    ]);
  });
});
