export interface RevocationRequest {
  peer_id?: string;
  key_fingerprint?: string;
  reason?: string;
}

export interface RevocationStore {
  revoke(request: RevocationRequest): { ok: true; revoked_at: string };
  isRevoked(peerId?: string, keyFingerprint?: string): boolean;
}

export function createRevocationStore(): RevocationStore {
  const revokedPeerIds = new Set<string>();
  const revokedFingerprints = new Set<string>();

  return {
    revoke(request) {
      if (request.peer_id) {
        revokedPeerIds.add(request.peer_id);
      }
      if (request.key_fingerprint) {
        revokedFingerprints.add(request.key_fingerprint);
      }

      return {
        ok: true,
        revoked_at: new Date().toISOString()
      };
    },

    isRevoked(peerId, keyFingerprint) {
      return Boolean(
        (peerId && revokedPeerIds.has(peerId)) ||
          (keyFingerprint && revokedFingerprints.has(keyFingerprint))
      );
    }
  };
}
