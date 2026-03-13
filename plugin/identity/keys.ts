import { createHash, generateKeyPairSync } from "node:crypto";

export interface LocalPeerIdentity {
  peer_id: string;
  public_key: string;
  key_fingerprint: string;
}

export function generateLocalPeerIdentity(): LocalPeerIdentity {
  const { publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const fingerprint = createHash("sha256").update(publicKeyPem).digest("hex");

  return {
    peer_id: `peer_${fingerprint.slice(0, 12)}`,
    public_key: publicKeyPem,
    key_fingerprint: `sha256:${fingerprint}`
  };
}
