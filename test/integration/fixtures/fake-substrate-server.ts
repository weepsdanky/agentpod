import { createHubRouter } from "../../../hub/operator-api/routes";
import type { AgentPodTransport, AgentPodTransportRequest } from "../../../plugin/client";
import type { CapabilityManifest, PeerProfile, TaskResult, TaskUpdate } from "../../../plugin/types/agentpod";

interface FakeTransportOptions {
  networkId: string;
  peers: PeerProfile[];
}

type TaskEvent = { kind: "update" | "result"; data: TaskUpdate | TaskResult };

export function createFakeAgentPodTransport(
  options: FakeTransportOptions
): AgentPodTransport & {
  fetchJoinManifest(joinUrl: string): Promise<{
    network_id: string;
    directory_url: string;
    substrate_url: string;
  }>;
  publishedManifests(): CapabilityManifest[];
} {
  const baseUrl = "https://agentpod.ai";
  const router = createHubRouter({
    mode: options.networkId === "agentpod-public" ? "managed" : "private",
    networkId: options.networkId,
    directoryUrl: `${baseUrl}/directory`,
    substrateUrl: "wss://agentpod.ai/substrate",
    operatorKeyId: "operator-key-2026-03",
    issuer: `${options.networkId}-operator`,
    manifestSignature: "manifest-signature",
    operatorToken: "operator-secret",
    discoveryRecords: [],
    peerProfiles: options.peers
  });

  return {
    async request(request: AgentPodTransportRequest) {
      const response = await router.handle(request);
      return response.body;
    },

    subscribe(path, onEvent) {
      const match = path.match(/^\/v1\/tasks\/([^/]+)\/events$/);
      if (!match) {
        return () => undefined;
      }

      return router.subscribeTask(match[1], onEvent as (event: TaskEvent) => void);
    },

    async fetchJoinManifest(joinUrl: string) {
      const response = await router.handle({
        method: "GET",
        path: `/v1/networks/${options.networkId}/join-manifest`
      });

      if (response.status !== 200) {
        return {
          network_id: options.networkId,
          directory_url: `${joinUrl.replace(/\/+$/, "")}/directory`,
          substrate_url: joinUrl.replace(/^http/i, "ws").replace(/\/+$/, "/substrate")
        };
      }

      return response.body as {
        network_id: string;
        directory_url: string;
        substrate_url: string;
      };
    },

    publishedManifests() {
      return router.publishedManifests();
    }
  };
}
