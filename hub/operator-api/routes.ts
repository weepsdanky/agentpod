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

  function publishTaskEvent(taskId: string, event: TaskStreamEvent) {
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
