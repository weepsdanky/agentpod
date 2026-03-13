import type {
  CapabilityManifest,
  PeerProfile,
  TaskRequest,
  TaskResult,
  TaskUpdate
} from "./types/agentpod";

export interface AgentPodTransportRequest {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
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
  claimInboundTask(peerId: string): Promise<TaskRequest | null>;
  publishTaskEvent(taskId: string, event: TaskUpdate | TaskResult): Promise<void>;
  subscribeTask(
    taskId: string,
    onEvent: (event: TaskUpdate | TaskResult) => void
  ): Promise<() => void>;
}

interface HttpAgentPodTransportOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
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

    async claimInboundTask(peerId) {
      const response = (await transport.request({
        method: "POST",
        path: "/v1/runtime/mailbox/claim",
        body: {
          peer_id: peerId
        }
      })) as { task?: TaskRequest | null };

      return response.task ?? null;
    },

    async publishTaskEvent(taskId, event) {
      const kind = "status" in event ? "result" : "update";
      await transport.request({
        method: "POST",
        path: "/v1/runtime/tasks/event",
        body: {
          task_id: taskId,
          event: {
            kind,
            data: event
          }
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

export function createHttpAgentPodTransport(
  options: HttpAgentPodTransportOptions
): AgentPodTransport {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async request(request) {
      const response = await fetchImpl(`${baseUrl}${request.path}`, {
        method: request.method,
        headers: {
          "content-type": "application/json"
        },
        body: request.body ? JSON.stringify(request.body) : undefined
      });
      const body = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(`AgentPod request failed: ${response.status}`);
      }

      return body;
    },

    async subscribe(path, onEvent) {
      const abortController = new AbortController();
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: "GET",
        headers: {
          accept: "text/event-stream"
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
