import type { RevocationStore } from "./revocation";
import type { TokenStore } from "./token-issuer";

export interface TokenRenewRequest {
  peer_id: string;
  key_fingerprint: string;
}

export function renewToken(
  bearerToken: string | undefined,
  request: TokenRenewRequest,
  tokens: TokenStore,
  revocations: RevocationStore
) {
  if (!bearerToken) {
    throw new Error("Missing bearer token");
  }

  const existingToken = tokens.getByToken(bearerToken);
  if (!existingToken) {
    throw new Error("Unknown bearer token");
  }

  if (
    existingToken.peerId !== request.peer_id ||
    existingToken.keyFingerprint !== request.key_fingerprint
  ) {
    throw new Error("Peer identity mismatch");
  }

  if (revocations.isRevoked(request.peer_id, request.key_fingerprint)) {
    throw new Error("Peer revoked");
  }

  return tokens.mint(request.peer_id, request.key_fingerprint);
}
