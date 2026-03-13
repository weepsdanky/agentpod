import type { DiscoveryVisibility } from "../projection/visibility-filter";

export interface DiscoveryRecord {
  peer_id: string;
  network_id: string;
  display_name: string;
  summary: string;
  services: Array<{ id: string; summary: string }>;
  risk_flags: string[];
  visibility: DiscoveryVisibility;
  operator_verified: boolean;
  key_fingerprint?: string;
  last_seen_at: string;
  updated_at: string;
}

export function createInMemoryDiscoveryWiring(records: DiscoveryRecord[]) {
  return {
    listRecords(): DiscoveryRecord[] {
      return [...records];
    }
  };
}
