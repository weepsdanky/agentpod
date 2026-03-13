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
  subscribeTask(
    taskId: string,
    onEvent: (event: TaskUpdate | TaskResult) => void
  ): Promise<() => void>;
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

    async subscribeTask(taskId, onEvent) {
      return transport.subscribe(`/v1/tasks/${taskId}/events`, (event) => {
        onEvent(event.data);
      });
    }
  };
}
