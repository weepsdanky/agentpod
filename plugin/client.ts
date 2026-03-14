import type {
  CapabilityManifest,
  PeerProfile,
  RuntimePeerAuth,
  TaskRequest,
  TaskResult,
  TaskUpdate
} from "./types/agentpod";
import type { LocalPeerIdentity } from "./identity/keys";
import { createRuntimePeerAuth } from "./identity/keys";

export interface AgentPodTransportRequest {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface AgentPodTransportEvent {
  kind: "update" | "result";
  data: TaskUpdate | TaskResult;
}

export interface AgentPodTransport {
  request(request: AgentPodTransportRequest): Promise<unknown>;
  subscribe(
    path: string,
    onEvent: (event: AgentPodTransportEvent) => void
  ): Promise<() => void> | (() => void);
}

export interface DelegationHandle {
  task_id: string;
  status: string;
}

export interface AgentPodClient {
  publishManifest(manifest: CapabilityManifest): Promise<void>;
  listPeers(): Promise<PeerProfile[]>;
  delegate(task: TaskRequest): Promise<DelegationHandle>;
  claimInboundTask(identity: LocalPeerIdentity): Promise<TaskRequest | null>;
  publishTaskEvent(
    taskId: string,
    event: TaskUpdate | TaskResult,
    identity: LocalPeerIdentity
  ): Promise<void>;
  subscribeTask(
    taskId: string,
    onEvent: (event: TaskUpdate | TaskResult) => void
  ): Promise<() => void>;
}

interface HttpAgentPodTransportOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  bearerToken?: string;
}

export function createAgentPodClient(transport: AgentPodTransport): AgentPodClient {
  return {
    async publishManifest(manifest) {
      await transport.request({
        method: "POST",
        path: "/v1/capabilities/publish",
        body: { manifest }
      });
    },

    async listPeers() {
      const response = (await transport.request({
        method: "GET",
        path: "/v1/peers"
      })) as { peers: PeerProfile[] };

      return response.peers;
    },

    async delegate(task) {
      return (await transport.request({
        method: "POST",
        path: "/v1/tasks/delegate",
        body: { task }
      })) as DelegationHandle;
    },

    async claimInboundTask(identity) {
      const auth = createSignedRuntimeAuth(identity, {
        path: "/v1/runtime/mailbox/claim",
        peer_id: identity.peer_id
      });
      const response = (await transport.request({
        method: "POST",
        path: "/v1/runtime/mailbox/claim",
        body: {
          peer_id: identity.peer_id,
          auth
        }
      })) as { task?: TaskRequest | null };

      return response.task ?? null;
    },

    async publishTaskEvent(taskId, event, identity) {
      const kind = "status" in event ? "result" : "update";
      const auth = createSignedRuntimeAuth(identity, {
        path: "/v1/runtime/tasks/event",
        peer_id: identity.peer_id,
        task_id: taskId,
        event: {
          kind,
          data: event
        }
      });
      await transport.request({
        method: "POST",
        path: "/v1/runtime/tasks/event",
        body: {
          peer_id: identity.peer_id,
          task_id: taskId,
          event: {
            kind,
            data: event
          },
          auth
        }
      });
    },

    async subscribeTask(taskId, onEvent) {
      return transport.subscribe(`/v1/tasks/${taskId}/events`, (event) => {
        onEvent(event.data);
      });
    }
  };
}

function createSignedRuntimeAuth(
  identity: LocalPeerIdentity,
  payload: Record<string, unknown>
): RuntimePeerAuth {
  return createRuntimePeerAuth(identity, payload);
}

export function createHttpAgentPodTransport(
  options: HttpAgentPodTransportOptions
): AgentPodTransport {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const authorization = options.bearerToken ? `Bearer ${options.bearerToken}` : undefined;

  return {
    async request(request) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...(request.headers ?? {})
      };
      if (authorization) {
        headers.authorization = authorization;
      }

      const url = `${baseUrl}${request.path}`;
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: request.method,
          headers,
          body: request.body ? JSON.stringify(request.body) : undefined
        });
      } catch (error) {
        const cause =
          error instanceof Error && "cause" in error
            ? (error as Error & { cause?: unknown }).cause
            : undefined;
        const causeText =
          cause && typeof cause === "object"
            ? JSON.stringify(cause, Object.getOwnPropertyNames(cause))
            : String(cause ?? "");
        throw new Error(
          `AgentPod transport fetch failed for ${request.method} ${url}: ${error instanceof Error ? error.message : String(error)}${causeText ? ` | cause=${causeText}` : ""}`
        );
      }

      const rawText = typeof (response as Response & { text?: unknown }).text === "function"
        ? await response.text()
        : undefined;
      const text =
        typeof rawText === "string"
          ? rawText
          : typeof (response as Response & { json?: unknown }).json === "function"
            ? JSON.stringify(await response.json())
            : "";
      let body: unknown = null;
      if (text.length > 0) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = text;
        }
      }

      if (!response.ok) {
        throw new Error(
          `AgentPod request failed: ${response.status} ${request.method} ${url}${text ? ` | body=${text.slice(0, 500)}` : ""}`
        );
      }

      return body;
    },

    async subscribe(path, onEvent) {
      const abortController = new AbortController();
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: "GET",
        headers: {
          accept: "text/event-stream",
          ...(authorization ? { authorization } : {})
        },
        signal: abortController.signal
      });

      if (!response.ok || !response.body) {
        throw new Error(`AgentPod subscription failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const pump = readEventStream(reader, onEvent);

      return async () => {
        abortController.abort();
        try {
          await pump;
        } catch (error) {
          if (!(error instanceof Error) || error.name !== "AbortError") {
            throw error;
          }
        }
      };
    }
  };
}

async function readEventStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: AgentPodTransportEvent) => void
) {
  let buffer = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      return;
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
        onEvent(JSON.parse(line.slice("data: ".length)) as AgentPodTransportEvent);
      }
      separatorIndex = buffer.indexOf("\n\n");
    }
  }
}
