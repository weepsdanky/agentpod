import type { CapabilityManifest } from "../types/agentpod";

import type { CompileSourceOptions } from "./validator";
import { validateAgentPodSource } from "./validator";

export function compileAgentPodSource(
  source: string,
  options: CompileSourceOptions
): CapabilityManifest {
  const parsed = validateAgentPodSource(source);

  return {
    version: "0.1",
    peer_id: options.peerId,
    issued_at: options.issuedAt,
    expires_at: options.expiresAt,
    signature: options.signature,
    services: parsed.services
  };
}
