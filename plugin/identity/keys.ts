import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";

import type { CapabilityManifest, RuntimePeerAuth } from "../types/agentpod";

export interface LocalPeerIdentity {
  peer_id: string;
  public_key: string;
  private_key: string;
  key_fingerprint: string;
}

export function generateLocalPeerIdentity(): LocalPeerIdentity {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const fingerprint = createHash("sha256").update(publicKeyPem).digest("hex");

  return {
    peer_id: `peer_${fingerprint.slice(0, 12)}`,
    public_key: publicKeyPem,
    private_key: privateKeyPem,
    key_fingerprint: `sha256:${fingerprint}`
  };
}

function derivePeerIdentity(publicKey: string) {
  const fingerprint = createHash("sha256").update(publicKey).digest("hex");

  return {
    peer_id: `peer_${fingerprint.slice(0, 12)}`,
    key_fingerprint: `sha256:${fingerprint}`
  };
}

export function createCapabilityManifestSigningPayload(
  manifest: Omit<CapabilityManifest, "signature">
) {
  return JSON.stringify({
    version: manifest.version,
    peer_id: manifest.peer_id,
    issued_at: manifest.issued_at,
    expires_at: manifest.expires_at,
    services: manifest.services
  });
}

export function signCapabilityManifest(
  identity: LocalPeerIdentity,
  manifest: Omit<CapabilityManifest, "signature">
) {
  return sign(
    null,
    Buffer.from(createCapabilityManifestSigningPayload(manifest)),
    identity.private_key
  ).toString("base64");
}

export function createRuntimePeerAuth(
  identity: LocalPeerIdentity,
  payload: Record<string, unknown>
): RuntimePeerAuth {
  return {
    peer_id: identity.peer_id,
    public_key: identity.public_key,
    key_fingerprint: identity.key_fingerprint,
    signature: sign(null, Buffer.from(JSON.stringify(payload)), identity.private_key).toString("base64")
  };
}

export function verifyRuntimePeerAuth(
  auth: RuntimePeerAuth,
  payload: Record<string, unknown>
) {
  const derived = derivePeerIdentity(auth.public_key);
  if (derived.peer_id !== auth.peer_id || derived.key_fingerprint !== auth.key_fingerprint) {
    return false;
  }

  return verify(
    null,
    Buffer.from(JSON.stringify(payload)),
    auth.public_key,
    Buffer.from(auth.signature, "base64")
  );
}
