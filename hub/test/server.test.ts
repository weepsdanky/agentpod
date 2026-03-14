import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startHubServer, type RunningHubServer } from "../index";
import { createHubRouter } from "../operator-api/routes";

function generateRuntimeIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const public_key = publicKey.export({ format: "pem", type: "spki" }).toString();
  const private_key = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const fingerprint = createHash("sha256").update(public_key).digest("hex");

  return {
    peer_id: `peer_${fingerprint.slice(0, 12)}`,
    public_key,
    private_key,
    key_fingerprint: `sha256:${fingerprint}`
  };
}

function createRuntimePeerAuth(
  identity: ReturnType<typeof generateRuntimeIdentity>,
  payload: Record<string, unknown>
) {
  return {
    peer_id: identity.peer_id,
    public_key: identity.public_key,
    key_fingerprint: identity.key_fingerprint,
    signature: sign(null, Buffer.from(JSON.stringify(payload)), identity.private_key).toString(
      "base64"
    )
  };
}

describe("AgentPod hub router", () => {
  let server: RunningHubServer | null = null;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agentpod-hub-"));
  });

  afterEach(async () => {
    await server?.close();
    server = null;
    await rm(tempDir, { recursive: true, force: true });
  });

  function createClaimBody(peerIdOverride?: string) {
    const identity = generateRuntimeIdentity();
    const peer_id = peerIdOverride ?? identity.peer_id;

    return {
      identity,
      body: {
        peer_id,
        auth: createRuntimePeerAuth(identity, {
          path: "/v1/runtime/mailbox/claim",
          peer_id
        })
      }
    };
  }

  function createEventBody(input: {
    identity: ReturnType<typeof generateRuntimeIdentity>;
    taskId: string;
    event: Record<string, unknown>;
    peerIdOverride?: string;
  }) {
    const peer_id = input.peerIdOverride ?? input.identity.peer_id;

    return {
      peer_id,
      task_id: input.taskId,
      event: input.event,
      auth: createRuntimePeerAuth(input.identity, {
        path: "/v1/runtime/tasks/event",
        peer_id,
        task_id: input.taskId,
        event: input.event
      })
    };
  }

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

  it("supports console APIs for listing peers and enqueueing tasks to a target peer", async () => {
    const identity = generateRuntimeIdentity();
    const router = createHubRouter({
      mode: "private",
      networkId: "team-a",
      directoryUrl: "http://127.0.0.1:4590/directory",
      substrateUrl: "ws://127.0.0.1:4590/substrate",
      operatorToken: "console-secret",
      discoveryRecords: [],
      peerProfiles: [
        {
          peer_id: identity.peer_id,
          network_id: "team-a",
          display_name: "Console Test Peer",
          public_key: identity.public_key,
          key_fingerprint: identity.key_fingerprint,
          trust_signals: [],
          last_seen_at: "2026-03-14T08:00:00Z"
        }
      ]
    } as any);

    const peers = await router.handle({
      method: "GET",
      path: "/v1/console/peers",
      headers: { authorization: "Bearer console-secret" }
    });
    expect(peers.status).toBe(200);
    expect(peers.body).toMatchObject({
      peers: [expect.objectContaining({ peer_id: identity.peer_id })]
    });

    const enqueue = await router.handle({
      method: "POST",
      path: "/v1/console/tasks",
      headers: { authorization: "Bearer console-secret" },
      body: {
        peer_id: identity.peer_id,
        task: {
          title: "Smoke test",
          prompt: "Say hello",
          input: {
            payload: { text: "hello" }
          },
          metadata: { source: "console" }
        }
      }
    });
    expect(enqueue.status).toBe(200);
    expect(enqueue.body).toMatchObject({ ok: true, peer_id: identity.peer_id, status: "queued" });

    const listed = await router.handle({
      method: "GET",
      path: "/v1/console/tasks",
      headers: { authorization: "Bearer console-secret" }
    });
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({
      tasks: [expect.objectContaining({ task_id: enqueue.body.task_id, status: "queued" })]
    });

    const claim = await router.handle({
      method: "POST",
      path: "/v1/runtime/mailbox/claim",
      headers: { authorization: "Bearer console-secret" },
      body: {
        peer_id: identity.peer_id,
        auth: createRuntimePeerAuth(identity, {
          path: "/v1/runtime/mailbox/claim",
          peer_id: identity.peer_id
        })
      }
    });
    expect(claim.status).toBe(200);

    const detail = await router.handle({
      method: "GET",
      path: `/v1/console/tasks/${enqueue.body.task_id}`,
      headers: { authorization: "Bearer console-secret" }
    });
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ task_id: enqueue.body.task_id, status: "claimed" });
  });

  it("routes delegated work through an injected delivery handler instead of fabricating completion", async () => {
    const deliverTask = vi.fn(async ({ task, publish }) => {
      publish({
        kind: "update",
        data: {
          version: "0.1",
          task_id: task.task_id,
          state: "running",
          message: "Spawned local subagent session",
          progress: 0.1,
          timestamp: "2026-03-13T09:00:00Z"
        }
      });
    });
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
      deliverTask
    } as any);
    const events: Array<{ kind: string; data: unknown }> = [];

    router.subscribeTask("task_runtime_123", (event) => {
      events.push(event);
    });

    const response = await router.handle({
      method: "POST",
      path: "/v1/tasks/delegate",
      body: {
        task: {
          version: "0.1",
          task_id: "task_runtime_123",
          service: "product_brainstorm",
          input: {
            payload: { text: "Use a real subagent" },
            attachments: []
          },
          delivery: {
            reply: "origin_session",
            artifacts: "inline_only"
          }
        }
      }
    });

    expect(response).toMatchObject({
      status: 200,
      body: {
        task_id: "task_runtime_123",
        status: "queued"
      }
    });
    expect(deliverTask).toHaveBeenCalledOnce();
    expect(events).toEqual([
      {
        kind: "update",
        data: {
          version: "0.1",
          task_id: "task_runtime_123",
          state: "running",
          message: "Spawned local subagent session",
          progress: 0.1,
          timestamp: "2026-03-13T09:00:00Z"
        }
      }
    ]);
  });

  it("queues targeted tasks in a peer mailbox and relays runtime events", async () => {
    const { identity, body: claimBody } = createClaimBody();
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
    const events: Array<{ kind: string; data: unknown }> = [];

    router.subscribeTask("task_mailbox_123", (event) => {
      events.push(event);
    });

    await expect(
      router.handle({
        method: "POST",
        path: "/v1/tasks/delegate",
        body: {
          task: {
            version: "0.1",
            task_id: "task_mailbox_123",
            target_peer_id: identity.peer_id,
            service: "product_brainstorm",
            input: {
              payload: { text: "Queue this for the remote peer" },
              attachments: []
            },
            delivery: {
              reply: "origin_session",
              artifacts: "inline_only"
            }
          }
        }
      })
    ).resolves.toMatchObject({
      status: 200,
      body: {
        task_id: "task_mailbox_123",
        status: "queued"
      }
    });

    await expect(
      router.handle({
        method: "POST",
        path: "/v1/runtime/mailbox/claim",
        body: claimBody
      })
    ).resolves.toMatchObject({
      status: 200,
      body: {
        task: expect.objectContaining({
          task_id: "task_mailbox_123",
          target_peer_id: identity.peer_id
        })
      }
    });

    await expect(
      router.handle({
        method: "POST",
        path: "/v1/runtime/mailbox/claim",
        body: claimBody
      })
    ).resolves.toEqual({
      status: 200,
      body: {
        task: null
      }
    });

    await router.handle({
      method: "POST",
      path: "/v1/runtime/tasks/event",
      body: createEventBody({
        identity,
        taskId: "task_mailbox_123",
        event: {
          kind: "update",
          data: {
            version: "0.1",
            task_id: "task_mailbox_123",
            state: "running",
            message: "Remote peer claimed the task",
            progress: 0.2,
            timestamp: "2026-03-13T09:30:00Z"
          }
        }
      })
    });

    expect(events).toEqual([
      {
        kind: "update",
        data: {
          version: "0.1",
          task_id: "task_mailbox_123",
          state: "running",
          message: "Remote peer claimed the task",
          progress: 0.2,
          timestamp: "2026-03-13T09:30:00Z"
        }
      }
    ]);
  });

  it("rejects unauthenticated runtime mailbox access and event publishing", async () => {
    const { identity } = createClaimBody();
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

    await expect(
      router.handle({
        method: "POST",
        path: "/v1/runtime/mailbox/claim",
        body: {
          peer_id: "peer_remote"
        }
      })
    ).resolves.toEqual({
      status: 401,
      body: {
        error: "runtime_auth_required"
      }
    });

    await expect(
      router.handle({
        method: "POST",
        path: "/v1/runtime/tasks/event",
        body: {
          peer_id: identity.peer_id,
          task_id: "task_mailbox_123",
          event: {
            kind: "update",
            data: {
              version: "0.1",
              task_id: "task_mailbox_123",
              state: "running",
              message: "spoofed",
              timestamp: "2026-03-13T09:30:00Z"
            }
          }
        }
      })
    ).resolves.toEqual({
      status: 401,
      body: {
        error: "runtime_auth_required"
      }
    });
  });

  it("rejects runtime requests signed by the wrong peer identity", async () => {
    const claimed = createClaimBody();
    const impostor = createClaimBody(claimed.identity.peer_id);
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

    await expect(
      router.handle({
        method: "POST",
        path: "/v1/tasks/delegate",
        body: {
          task: {
            version: "0.1",
            task_id: "task_mailbox_auth_123",
            target_peer_id: claimed.identity.peer_id,
            service: "product_brainstorm",
            input: {
              payload: { text: "Queue this for the signed peer" },
              attachments: []
            },
            delivery: {
              reply: "origin_session",
              artifacts: "inline_only"
            }
          }
        }
      })
    ).resolves.toMatchObject({ status: 200 });

    await expect(
      router.handle({
        method: "POST",
        path: "/v1/runtime/mailbox/claim",
        body: impostor.body
      })
    ).resolves.toEqual({
      status: 403,
      body: {
        error: "runtime_peer_mismatch"
      }
    });
  });

  it("persists queued mailbox tasks across router restarts", async () => {
    const { identity, body: claimBody } = createClaimBody();
    const mailboxStatePath = join(tempDir, "mailbox.json");
    const firstRouter = createHubRouter({
      mode: "managed",
      networkId: "agentpod-public",
      directoryUrl: "https://agentpod.ai/directory",
      substrateUrl: "wss://agentpod.ai/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: [],
      mailboxStatePath
    } as any);

    await expect(
      firstRouter.handle({
        method: "POST",
        path: "/v1/tasks/delegate",
        body: {
          task: {
            version: "0.1",
            task_id: "task_mailbox_persist_123",
            target_peer_id: identity.peer_id,
            service: "product_brainstorm",
            input: {
              payload: { text: "Persist this queued task" },
              attachments: []
            },
            delivery: {
              reply: "origin_session",
              artifacts: "inline_only"
            }
          }
        }
      })
    ).resolves.toMatchObject({
      status: 200,
      body: {
        task_id: "task_mailbox_persist_123",
        status: "queued"
      }
    });

    const restartedRouter = createHubRouter({
      mode: "managed",
      networkId: "agentpod-public",
      directoryUrl: "https://agentpod.ai/directory",
      substrateUrl: "wss://agentpod.ai/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: [],
      mailboxStatePath
    } as any);

    await expect(
      restartedRouter.handle({
        method: "POST",
        path: "/v1/runtime/mailbox/claim",
        body: claimBody
      })
    ).resolves.toMatchObject({
      status: 200,
      body: {
        task: expect.objectContaining({
          task_id: "task_mailbox_persist_123",
          target_peer_id: identity.peer_id
        })
      }
    });
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
