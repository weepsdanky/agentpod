import { describe, expect, it, vi } from "vitest";

import { createSubstrateSync } from "../service/substrate-sync";
import type { CapabilityManifest, PeerProfile } from "../types/agentpod";

describe("AgentPod substrate sync", () => {
  it("publishes sanitized manifest data and refreshes peer cache after join", async () => {
    const peers: PeerProfile[] = [
      {
        peer_id: "peer_123",
        network_id: "agentpod-public",
        display_name: "Design Peer",
        owner_label: "mark-lab",
        public_key: "base64...",
        key_fingerprint: "sha256:abcd...",
        trust_signals: ["operator_verified"],
        last_seen_at: "2026-03-12T10:54:00Z"
      }
    ];
    const peerCache = {
      replace: vi.fn(),
      list: vi.fn(() => peers)
    };
    const publishManifest = vi.fn(async (_manifest: CapabilityManifest) => undefined);
    const listPeers = vi.fn(async () => peers);
    const sync = createSubstrateSync(peerCache, {
      publishManifest,
      listPeers
    });
    const manifest: CapabilityManifest = {
      version: "0.1",
      peer_id: "peer_local",
      issued_at: "2026-03-12T10:40:00Z",
      expires_at: "2026-04-12T10:40:00Z",
      signature: "base64...",
      services: [
        {
          id: "product_brainstorm",
          summary: "Brainstorm product directions.",
          io: {
            payload_types: ["text/plain"],
            attachment_types: ["application/pdf"],
            result_types: ["text/markdown"]
          }
        }
      ]
    };

    const nextPeers = await sync.publishAndRefresh(manifest);

    expect(publishManifest).toHaveBeenCalledWith(manifest);
    expect(listPeers).toHaveBeenCalledOnce();
    expect(peerCache.replace).toHaveBeenCalledWith(peers);
    expect(nextPeers).toEqual(peers);
  });

  it("keeps remote task delivery off the plugin HTTP surface", async () => {
    const peerCache = {
      replace: vi.fn(),
      list: vi.fn(() => [])
    };
    const sync = createSubstrateSync(peerCache);

    expect("acceptRemoteTask" in sync).toBe(false);
  });
});
