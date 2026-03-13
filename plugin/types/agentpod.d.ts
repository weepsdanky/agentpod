export type ProtocolVersion = "0.1";

export type AdmissionPolicy = "auto" | "owner_confirm";
export type ToolUsePolicy = "allow" | "ask" | "deny";
export type ArtifactPolicy = "inline_only" | "allow_links";
export type FollowupPolicy = "allow" | "deny";
export type ResultDetailPolicy = "summary" | "full";
export type ReplyMode = "origin_session";
export type DeliveryArtifactMode = "inline_only" | "allow_links";
export type TaskState = "queued" | "accepted" | "running" | "completed" | "failed";
export type TaskStatus = "completed" | "failed";
export type PublicCardVisibility = "private" | "network_only" | "public";

export interface ServiceIoShape {
  payload_types: string[];
  attachment_types: string[];
  result_types: string[];
}

export interface ServicePolicy {
  admission?: AdmissionPolicy;
  tool_use?: ToolUsePolicy;
  artifact?: ArtifactPolicy;
  max_concurrency?: number;
}

export interface ServiceSpec {
  id: string;
  summary: string;
  io: ServiceIoShape;
  policy?: ServicePolicy;
}

export interface PeerProfile {
  peer_id: string;
  network_id: string;
  display_name: string;
  owner_label?: string;
  public_key: string;
  key_fingerprint: string;
  trust_signals: string[];
  last_seen_at: string;
}

export interface CapabilityManifest {
  version: ProtocolVersion;
  peer_id: string;
  issued_at: string;
  expires_at: string;
  signature: string;
  services: ServiceSpec[];
}

export interface TaskInput {
  payload: Record<string, unknown>;
  attachments: Array<Record<string, unknown>>;
}

export interface RequestPolicy {
  tool_use?: ToolUsePolicy;
  followups?: FollowupPolicy;
  result_detail?: ResultDetailPolicy;
}

export interface DeliveryPolicy {
  reply: ReplyMode;
  artifacts?: DeliveryArtifactMode;
}

export interface TaskRequest {
  version: ProtocolVersion;
  task_id: string;
  target_peer_id?: string;
  service: string;
  input: TaskInput;
  policy?: RequestPolicy;
  delivery: DeliveryPolicy;
}

export interface TaskUpdate {
  version: ProtocolVersion;
  task_id: string;
  state: Exclude<TaskState, "completed" | "failed">;
  message?: string;
  progress?: number;
  timestamp: string;
}

export interface ArtifactRef {
  kind?: "inline" | "relay";
  name?: string;
  mime_type?: string;
  url?: string;
  content?: string;
}

export interface ExecutionSummary {
  used_tools: string[];
  used_network: boolean;
}

export interface TaskResult {
  version: ProtocolVersion;
  task_id: string;
  status: TaskStatus;
  output: Record<string, unknown>;
  artifacts: ArtifactRef[];
  execution_summary?: ExecutionSummary;
}

export interface PublicCardService {
  id: string;
  summary: string;
}

export interface PublicCard {
  version: ProtocolVersion;
  peer_id: string;
  network_id: string;
  display_name: string;
  summary: string;
  services: PublicCardService[];
  risk_flags: string[];
  verified: boolean;
  last_seen_at: string;
  updated_at: string;
}

export interface ManagedNetworkProfile {
  mode: "managed";
  join_url: string;
}

export interface BearerAuthConfig {
  type: "bearer";
  token_env: string;
}

export interface PrivateNetworkProfile {
  mode: "private";
  network_id: string;
  base_url: string;
  auth?: BearerAuthConfig;
  publish_to_directory?: boolean;
  public_card_visibility?: PublicCardVisibility;
}

export type NetworkProfile = ManagedNetworkProfile | PrivateNetworkProfile;
