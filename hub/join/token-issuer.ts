import type { HubConfig } from "../config/schema";
import type { RevocationStore } from "./revocation";

export interface JoinExchangeRequest {
  network_id: string;
  peer_id: string;
  public_key: string;
  key_fingerprint: string;
  proof?: {
    signed_at: string;
    signature: string;
  };
}

interface StoredToken {
  accessToken: string;
  peerId: string;
  keyFingerprint: string;
}

export interface TokenStore {
  exchange(request: JoinExchangeRequest): {
    token_type: "bearer";
    access_token: string;
    issued_at: string;
    expires_at: string;
  };
  mint(peerId: string, keyFingerprint: string): {
    token_type: "bearer";
    access_token: string;
    issued_at: string;
    expires_at: string;
  };
  getByToken(token: string): StoredToken | undefined;
}

export function createTokenStore(config: HubConfig, revocations: RevocationStore): TokenStore {
  let tokenCounter = 0;
  const tokens = new Map<string, StoredToken>();

  const mint = (peerId: string, keyFingerprint: string) => {
    tokenCounter += 1;
    const accessToken = `agentpod_join_tok_${tokenCounter}`;
    tokens.set(accessToken, {
      accessToken,
      peerId,
      keyFingerprint
    });

    return {
      token_type: "bearer" as const,
      access_token: accessToken,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    };
  };

  return {
    exchange(request) {
      if (config.mode !== "managed") {
        throw new Error("Managed join exchange is not available in private mode");
      }
      if (request.network_id !== config.networkId) {
        throw new Error("Network mismatch");
      }
      if (revocations.isRevoked(request.peer_id, request.key_fingerprint)) {
        throw new Error("Peer revoked");
      }

      return mint(request.peer_id, request.key_fingerprint);
    },

    mint,

    getByToken(token) {
      return tokens.get(token);
    }
  };
}
