import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { generateLocalPeerIdentity, type LocalPeerIdentity } from "./keys";

export function loadOrCreateLocalPeerIdentity(path: string): LocalPeerIdentity {
  if (existsSync(path)) {
    const content = readFileSync(path, "utf8");
    return JSON.parse(content) as LocalPeerIdentity;
  }

  const identity = generateLocalPeerIdentity();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(identity, null, 2), "utf8");
  return identity;
}
