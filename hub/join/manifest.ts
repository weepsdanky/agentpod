import type { HubConfig } from "../config/schema";

export function createJoinManifest(config: HubConfig) {
  return {
    network_id: config.networkId,
    directory_url: config.directoryUrl,
    substrate_url: config.substrateUrl,
    alg: "Ed25519",
    key_id: config.operatorKeyId,
    issuer: config.issuer,
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    signature: config.manifestSignature
  };
}
