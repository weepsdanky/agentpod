import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { generateLocalPeerIdentity, type LocalPeerIdentity } from "./keys";

export function loadOrCreateLocalPeerIdentity(path: string): LocalPeerIdentity {
  if (existsSync(path)) {
    const content = readFileSync(path, "utf8");
    const parsed = JSON.parse(content) as Partial<LocalPeerIdentity>;
    if (
      typeof parsed.peer_id === "string" &&
      typeof parsed.public_key === "string" &&
      typeof parsed.private_key === "string" &&
      typeof parsed.key_fingerprint === "string"
    ) {
      return parsed as LocalPeerIdentity;
    }

    throw new Error(
      "Legacy AgentPod identity is missing a private key. Delete the identity file and rejoin to mint a new signed identity."
    );
  }

  const identity = generateLocalPeerIdentity();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(identity, null, 2), "utf8");
  return identity;
}
