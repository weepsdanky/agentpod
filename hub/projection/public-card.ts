import { isPubliclyVisible } from "./visibility-filter";
import { toVerifiedBadge } from "./verification-badges";
import type { DiscoveryRecord } from "../openagents/wiring";
import type { RevocationStore } from "../join/revocation";

export function projectPublicCards(
  records: DiscoveryRecord[],
  revocations: RevocationStore
) {
  return records
    .filter(
      (record) =>
        isPubliclyVisible(record.visibility) &&
        !revocations.isRevoked(record.peer_id, record.key_fingerprint)
    )
    .map((record) => ({
      version: "0.1" as const,
      peer_id: record.peer_id,
      network_id: record.network_id,
      display_name: record.display_name,
      summary: record.summary,
      services: record.services,
      risk_flags: record.risk_flags,
      verified: toVerifiedBadge(record.operator_verified),
      last_seen_at: record.last_seen_at,
      updated_at: record.updated_at
    }));
}
