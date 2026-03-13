import { createPeerCache } from "./peer-cache";
import type { CapabilityManifest, PeerProfile } from "../types/agentpod";

interface SyncClient {
  publishManifest?(manifest: CapabilityManifest): Promise<void>;
  listPeers?(): Promise<PeerProfile[]>;
}

export function createSubstrateSync(
  peerCache: ReturnType<typeof createPeerCache<PeerProfile>>,
  client: SyncClient = {}
) {
  return {
    refresh(peers: PeerProfile[]) {
      peerCache.replace(peers);
      return peerCache.list();
    },

    async publishAndRefresh(manifest: CapabilityManifest) {
      if (!client.publishManifest || !client.listPeers) {
        throw new Error("Substrate sync requires publishManifest and listPeers");
      }

      await client.publishManifest(manifest);
      const peers = await client.listPeers();
      peerCache.replace(peers);
      return peerCache.list();
    }
  };
}
