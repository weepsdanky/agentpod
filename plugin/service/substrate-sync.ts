import { createPeerCache } from "./peer-cache";

export function createSubstrateSync(peerCache: ReturnType<typeof createPeerCache>) {
  return {
    refresh(peers: Array<Record<string, unknown>>) {
      peerCache.replace(peers);
      return peerCache.list();
    }
  };
}
