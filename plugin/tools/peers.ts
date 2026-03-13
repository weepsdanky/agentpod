import type { PeerProfile } from "../types/agentpod";

interface PeerSnapshotSource {
  snapshot(): {
    peers: PeerProfile[];
  };
}

export function createPeersTool(source: PeerSnapshotSource) {
  return async function agentpodPeers(): Promise<PeerProfile[]> {
    return source.snapshot().peers;
  };
}
