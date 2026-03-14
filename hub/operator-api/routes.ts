import { createHash, verify } from "node:crypto";

import type { HubConfig } from "../config/schema";
import { createJoinManifest } from "../join/manifest";
import { createRevocationStore } from "../join/revocation";
import { createTokenStore, type JoinExchangeRequest } from "../join/token-issuer";
import { renewToken, type TokenRenewRequest } from "../join/token-renew";
import { createInMemoryDiscoveryWiring, type DiscoveryRecord } from "../openagents/wiring";
import { projectPublicCards } from "../projection/public-card";
import { createMailboxStore } from "../state/mailbox-store";
import type {
  CapabilityManifest,
  RuntimePeerAuth,
  TaskRequest,
  TaskResult,
  TaskUpdate
} from "../../plugin/types/agentpod";

type HttpMethod = "GET" | "POST";

interface RouterRequest {
  method: HttpMethod;
  path: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

interface RouterResponse {
  status: number;
  body: Record<string, unknown>;
}

interface TaskStreamEvent {
  kind: "update" | "result";
  data: TaskUpdate | TaskResult;
}

interface TaskDeliveryContext {
  task: TaskRequest;
  publish(event: TaskStreamEvent): void;
}

interface ConsoleTaskRecord {
  task_id: string;
  peer_id: string;
  status: "queued" | "claimed" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  task: TaskRequest;
  timeline: Array<{ type: string; at: string; detail?: string }>;
  result?: TaskResult;
  last_update?: TaskUpdate;
}

interface HubRouterConfig extends HubConfig {
  discoveryRecords: DiscoveryRecord[];
  peerProfiles?: unknown[];
  deliverTask?: (input: TaskDeliveryContext) => Promise<void> | void;
  mailboxStatePath?: string;
}

function verifySignedRuntimePeer(
  auth: RuntimePeerAuth,
  payload: Record<string, unknown>
) {
  const fingerprint = createHash("sha256").update(auth.public_key).digest("hex");
  if (
    auth.peer_id !== `peer_${fingerprint.slice(0, 12)}` ||
    auth.key_fingerprint !== `sha256:${fingerprint}`
  ) {
    return false;
  }

  return verify(
    null,
    Buffer.from(JSON.stringify(payload)),
    auth.public_key,
    Buffer.from(auth.signature, "base64")
  );
}

export function createHubRouter(config: HubRouterConfig) {
  const revocations = createRevocationStore();
  const tokens = createTokenStore(config, revocations);
  const discovery = createInMemoryDiscoveryWiring(config.discoveryRecords);
  const publishedCapabilityManifests: CapabilityManifest[] = [];
  const peerProfiles = [...(config.peerProfiles ?? [])];
  const taskSubscribers = new Map<string, Array<(event: TaskStreamEvent) => void>>();
  const mailboxStore = createMailboxStore(config.mailboxStatePath);
  const taskBindings = new Map<string, string>();
  const consoleTasks = new Map<string, ConsoleTaskRecord>();

  function publishTaskEvent(taskId: string, event: TaskStreamEvent) {
    const existing = consoleTasks.get(taskId);
    const now = new Date().toISOString();
    if (existing) {
      existing.updated_at = now;
      if (event.kind === "update") {
        existing.last_update = event.data;
        existing.status = "claimed";
        existing.timeline.push({
          type: event.data.state,
          at: event.data.timestamp ?? now,
          detail: event.data.message
        });
      } else {
        existing.result = event.data;
        existing.status = event.data.status === "completed" ? "completed" : "failed";
        existing.timeline.push({
          type: event.data.status,
          at: now
        });
      }
    }

    for (const subscriber of taskSubscribers.get(taskId) ?? []) {
      subscriber(event);
    }
  }

  function requireRuntimeToken(request: RouterRequest): RouterResponse | null {
    if (!config.runtimeToken) {
      return null;
    }

    if (request.headers?.authorization === `Bearer ${config.runtimeToken}`) {
      return null;
    }

    return {
      status: 401,
      body: {
        error: "runtime_auth_required"
      }
    };
  }

  function requireSignedRuntimePeer(
    request: RouterRequest,
    payload: Record<string, unknown>
  ): { peerId: string } | RouterResponse {
    const runtimeTokenError = requireRuntimeToken(request);
    if (runtimeTokenError) {
      return runtimeTokenError;
    }

    const auth = request.body?.auth as RuntimePeerAuth | undefined;
    if (
      !auth ||
      typeof auth.peer_id !== "string" ||
      typeof auth.public_key !== "string" ||
      typeof auth.key_fingerprint !== "string" ||
      typeof auth.signature !== "string"
    ) {
      return {
        status: 401,
        body: {
          error: "runtime_auth_required"
        }
      };
    }

    if (!verifySignedRuntimePeer(auth, payload)) {
      return {
        status: 403,
        body: {
          error: "invalid_runtime_signature"
        }
      };
    }

    return {
      peerId: auth.peer_id
    };
  }

  return {
    async handle(request: RouterRequest): Promise<RouterResponse> {
      if (request.method === "POST" && request.path === "/v1/capabilities/publish") {
        publishedCapabilityManifests.push(request.body?.manifest as CapabilityManifest);
        return {
          status: 200,
          body: { ok: true }
        };
      }

      if (request.method === "GET" && request.path === "/v1/peers") {
        return {
          status: 200,
          body: {
            peers: peerProfiles
          }
        };
      }

      if (request.method === "GET" && request.path === "/v1/console/peers") {
        if (request.headers?.authorization !== `Bearer ${config.operatorToken}`) {
          return { status: 401, body: { error: "console_auth_required" } };
        }

        return {
          status: 200,
          body: {
            peers: peerProfiles,
            manifests: publishedCapabilityManifests
          }
        };
      }

      if (request.method === "GET" && request.path === "/v1/console/tasks") {
        if (request.headers?.authorization !== `Bearer ${config.operatorToken}`) {
          return { status: 401, body: { error: "console_auth_required" } };
        }

        return {
          status: 200,
          body: {
            tasks: [...consoleTasks.values()].map((task) => ({
              task_id: task.task_id,
              peer_id: task.peer_id,
              status: task.status,
              created_at: task.created_at,
              updated_at: task.updated_at
            }))
          }
        };
      }

      if (
        request.method === "GET" &&
        request.path === `/v1/networks/${config.networkId}/join-manifest`
      ) {
        if (config.mode !== "managed") {
          return { status: 404, body: { error: "not_found" } };
        }
        return { status: 200, body: createJoinManifest(config) };
      }

      if (request.method === "POST" && request.path === "/v1/join/exchange") {
        if (config.mode !== "managed") {
          return { status: 404, body: { error: "not_found" } };
        }
        return {
          status: 200,
          body: tokens.exchange(parseJoinExchangeRequest(request.body))
        };
      }

      if (request.method === "POST" && request.path === "/v1/tokens/renew") {
        if (config.mode !== "managed") {
          return { status: 404, body: { error: "not_found" } };
        }
        const bearerToken = request.headers?.authorization?.replace(/^Bearer\s+/i, "");
        try {
          return {
            status: 200,
            body: renewToken(
              bearerToken,
              parseTokenRenewRequest(request.body),
              tokens,
              revocations
            )
          };
        } catch (error) {
          return mapJoinAuthError(error);
        }
      }

      if (request.method === "POST" && request.path === "/v1/tokens/revoke") {
        if (request.headers?.authorization !== `Bearer ${config.operatorToken}`) {
          return { status: 401, body: { error: "operator_auth_required" } };
        }

        return {
          status: 200,
          body: revocations.revoke(request.body ?? {})
        };
      }

      if (request.method === "GET" && request.path === "/v1/public-cards") {
        return {
          status: 200,
          body: {
            cards: projectPublicCards(discovery.listRecords(), revocations)
          }
        };
      }

      const consoleTaskMatch = request.method === "GET"
        ? request.path.match(/^\/v1\/console\/tasks\/([^/]+)$/)
        : null;
      if (consoleTaskMatch) {
        if (request.headers?.authorization !== `Bearer ${config.operatorToken}`) {
          return { status: 401, body: { error: "console_auth_required" } };
        }
        const task = consoleTasks.get(consoleTaskMatch[1]);
        return task
          ? { status: 200, body: task }
          : { status: 404, body: { error: "task_not_found" } };
      }

      const publicCardMatch = request.method === "GET"
        ? request.path.match(/^\/v1\/public-cards\/([^/]+)$/)
        : null;
      if (publicCardMatch) {
        const card = projectPublicCards(discovery.listRecords(), revocations).find(
          (record) => record.peer_id === publicCardMatch[1]
        );
        return card
          ? { status: 200, body: card }
          : { status: 404, body: { error: "card_not_public" } };
      }

      if (request.method === "POST" && request.path === "/v1/console/tasks") {
        if (request.headers?.authorization !== `Bearer ${config.operatorToken}`) {
          return { status: 401, body: { error: "console_auth_required" } };
        }

        const peerId = String(request.body?.peer_id ?? "");
        const rawTask = (request.body?.task ?? {}) as Record<string, unknown>;
        if (!peerId) {
          return { status: 400, body: { error: "peer_id_required" } };
        }

        const taskId = `task_${Date.now().toString(36)}`;
        const now = new Date().toISOString();
        const task: TaskRequest = {
          version: "0.1",
          task_id: taskId,
          target_peer_id: peerId,
          service: typeof rawTask.service === "string" ? rawTask.service : "openclaw_debug",
          input: {
            payload:
              rawTask.input && typeof rawTask.input === "object"
                ? (rawTask.input as { payload?: Record<string, unknown> }).payload ?? {}
                : {
                    title: rawTask.title ?? "Console task",
                    prompt: rawTask.prompt ?? "",
                    input: rawTask.input ?? null,
                    metadata: rawTask.metadata ?? { source: "console" }
                  },
            attachments: []
          },
          delivery: {
            reply: "origin_session",
            artifacts: "inline_only"
          }
        };

        await mailboxStore.enqueue(peerId, task);
        consoleTasks.set(taskId, {
          task_id: taskId,
          peer_id: peerId,
          status: "queued",
          created_at: now,
          updated_at: now,
          task,
          timeline: [{ type: "queued", at: now }]
        });

        return {
          status: 200,
          body: {
            ok: true,
            task_id: taskId,
            peer_id: peerId,
            status: "queued"
          }
        };
      }

      if (request.method === "POST" && request.path === "/v1/tasks/delegate") {
        const task = request.body?.task as TaskRequest;
        if (config.deliverTask) {
          await config.deliverTask({
            task,
            publish(event) {
              publishTaskEvent(task.task_id, event);
            }
          });
        } else if (task.target_peer_id) {
          await mailboxStore.enqueue(task.target_peer_id, task);
        } else {
          const update: TaskUpdate = {
            version: "0.1",
            task_id: task.task_id,
            state: "running",
            message: "Remote peer is working",
            progress: 0.5,
            timestamp: "2026-03-12T10:45:00Z"
          };
          const result: TaskResult = {
            version: "0.1",
            task_id: task.task_id,
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
          publishTaskEvent(task.task_id, { kind: "update", data: update });
          publishTaskEvent(task.task_id, { kind: "result", data: result });
        }
        return {
          status: 200,
          body: {
            task_id: task.task_id,
            status: "queued"
          }
        };
      }

      if (request.method === "POST" && request.path === "/v1/runtime/mailbox/claim") {
        const requestedPeerId = String(request.body?.peer_id ?? "");
        const runtimePeer = requireSignedRuntimePeer(request, {
          path: "/v1/runtime/mailbox/claim",
          peer_id: requestedPeerId
        });
        if ("status" in runtimePeer) {
          return runtimePeer;
        }
        if (runtimePeer.peerId !== requestedPeerId) {
          return {
            status: 403,
            body: {
              error: "runtime_peer_mismatch"
            }
          };
        }

        const task = await mailboxStore.claim(requestedPeerId);
        if (task?.target_peer_id && task.target_peer_id !== runtimePeer.peerId) {
          return {
            status: 403,
            body: {
              error: "runtime_peer_mismatch"
            }
          };
        }
        if (task) {
          taskBindings.set(task.task_id, runtimePeer.peerId);
          const existing = consoleTasks.get(task.task_id);
          if (existing) {
            const now = new Date().toISOString();
            existing.status = "claimed";
            existing.updated_at = now;
            existing.timeline.push({ type: "claimed", at: now });
          }
        }

        return {
          status: 200,
          body: {
            task
          }
        };
      }

      if (request.method === "POST" && request.path === "/v1/runtime/tasks/event") {
        const taskId = String(request.body?.task_id ?? "");
        const event = request.body?.event as TaskStreamEvent | undefined;
        const peerId = String(request.body?.peer_id ?? "");
        const runtimePeer = requireSignedRuntimePeer(request, {
          path: "/v1/runtime/tasks/event",
          peer_id: peerId,
          task_id: taskId,
          event
        });
        if ("status" in runtimePeer) {
          return runtimePeer;
        }
        if (runtimePeer.peerId !== peerId) {
          return {
            status: 403,
            body: {
              error: "runtime_peer_mismatch"
            }
          };
        }
        if (taskBindings.get(taskId) !== peerId) {
          return {
            status: 403,
            body: {
              error: "runtime_peer_mismatch"
            }
          };
        }
        if (taskId && event && (event.kind === "update" || event.kind === "result")) {
          publishTaskEvent(taskId, event);
          if (event.kind === "result") {
            taskBindings.delete(taskId);
          }
          return {
            status: 200,
            body: {
              ok: true
            }
          };
        }

        return {
          status: 400,
          body: {
            error: "invalid_event"
          }
        };
      }

      return { status: 404, body: { error: "not_found" } };
    },

    subscribeTask(
      taskId: string,
      onEvent: (event: TaskStreamEvent) => void
    ) {
      const listeners = taskSubscribers.get(taskId) ?? [];
      listeners.push(onEvent);
      taskSubscribers.set(taskId, listeners);

      return () => {
        const nextListeners = (taskSubscribers.get(taskId) ?? []).filter(
          (listener) => listener !== onEvent
        );
        if (nextListeners.length === 0) {
          taskSubscribers.delete(taskId);
          return;
        }
        taskSubscribers.set(taskId, nextListeners);
      };
    },

    publishedManifests() {
      return [...publishedCapabilityManifests];
    }
  };
}

function mapJoinAuthError(error: unknown): RouterResponse {
  const message = error instanceof Error ? error.message : "";

  if (message === "Missing bearer token" || message === "Unknown bearer token") {
    return { status: 401, body: { error: "token_expired" } };
  }

  if (message === "Peer revoked") {
    return { status: 403, body: { error: "token_revoked" } };
  }

  if (message === "Peer identity mismatch") {
    return { status: 400, body: { error: "invalid_signature" } };
  }

  return { status: 400, body: { error: "invalid_request" } };
}

function parseJoinExchangeRequest(body: Record<string, unknown> | undefined): JoinExchangeRequest {
  const request = (body ?? {}) as Partial<JoinExchangeRequest>;

  return {
    network_id: String(request.network_id ?? ""),
    peer_id: String(request.peer_id ?? ""),
    public_key: String(request.public_key ?? ""),
    key_fingerprint: String(request.key_fingerprint ?? ""),
    proof:
      request.proof && typeof request.proof === "object"
        ? {
            signed_at: String((request.proof as { signed_at?: unknown }).signed_at ?? ""),
            signature: String((request.proof as { signature?: unknown }).signature ?? "")
          }
        : undefined
  };
}

function parseTokenRenewRequest(body: Record<string, unknown> | undefined): TokenRenewRequest {
  const request = (body ?? {}) as Partial<TokenRenewRequest>;

  return {
    peer_id: String(request.peer_id ?? ""),
    key_fingerprint: String(request.key_fingerprint ?? "")
  };
}
