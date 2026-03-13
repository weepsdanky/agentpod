import { describe, expect, it } from "vitest";

import type {
  CapabilityManifest,
  ManagedNetworkProfile,
  PeerProfile,
  PrivateNetworkProfile,
  PublicCard,
  ServiceSpec,
  TaskRequest,
  TaskResult,
  TaskUpdate
} from "../types/agentpod";

describe("AgentPod contract types", () => {
  it("supports peer and capability shapes", () => {
    const service: ServiceSpec = {
      id: "product_brainstorm",
      summary: "Brainstorm product directions.",
      io: {
        payload_types: ["text/plain"],
        attachment_types: ["application/pdf"],
        result_types: ["text/markdown"]
      },
      policy: {
        admission: "owner_confirm",
        tool_use: "ask",
        artifact: "allow_links",
        max_concurrency: 1
      }
    };

    const peer: PeerProfile = {
      peer_id: "peer_123",
      network_id: "agentpod-public",
      display_name: "Design Peer",
      owner_label: "mark-lab",
      public_key: "base64...",
      key_fingerprint: "sha256:abcd...",
      trust_signals: ["operator_verified"],
      last_seen_at: "2026-03-12T10:54:00Z"
    };

    const manifest: CapabilityManifest = {
      version: "0.1",
      peer_id: peer.peer_id,
      issued_at: "2026-03-12T10:40:00Z",
      expires_at: "2026-04-12T10:40:00Z",
      signature: "base64...",
      services: [service]
    };

    expect(manifest.services[0]?.id).toBe("product_brainstorm");
  });

  it("supports task lifecycle shapes", () => {
    const request: TaskRequest = {
      version: "0.1",
      task_id: "task_123",
      service: "product_brainstorm",
      input: {
        payload: {
          text: "Help brainstorm the MVP"
        },
        attachments: []
      },
      policy: {
        tool_use: "ask",
        followups: "deny",
        result_detail: "summary"
      },
      delivery: {
        reply: "origin_session",
        artifacts: "inline_only"
      }
    };

    const update: TaskUpdate = {
      version: "0.1",
      task_id: request.task_id,
      state: "running",
      message: "Reviewing the draft spec",
      progress: 0.5,
      timestamp: "2026-03-12T10:45:00Z"
    };

    const result: TaskResult = {
      version: "0.1",
      task_id: request.task_id,
      status: "completed",
      output: {
        text: "Here is a first-pass MVP structure."
      },
      artifacts: [],
      execution_summary: {
        used_tools: ["read_file"],
        used_network: false
      }
    };

    expect(update.task_id).toBe(result.task_id);
  });

  it("supports managed and private network profiles plus public cards", () => {
    const managed: ManagedNetworkProfile = {
      mode: "managed",
      join_url: "https://agentpod.ai/networks/public"
    };

    const privateProfile: PrivateNetworkProfile = {
      mode: "private",
      network_id: "team-a",
      base_url: "https://agentpod.internal.example.com",
      auth: {
        type: "bearer",
        token_env: "AGENTPOD_TOKEN"
      },
      publish_to_directory: true,
      public_card_visibility: "network_only"
    };

    const card: PublicCard = {
      version: "0.1",
      peer_id: "peer_123",
      network_id: "agentpod-public",
      display_name: "Design Peer",
      summary: "Helps with product thinking and specs.",
      services: [
        {
          id: "product_brainstorm",
          summary: "Brainstorm product ideas"
        }
      ],
      risk_flags: ["uses_network"],
      verified: true,
      last_seen_at: "2026-03-12T10:54:00Z",
      updated_at: "2026-03-12T10:40:00Z"
    };

    expect(managed.mode).toBe("managed");
    expect(privateProfile.mode).toBe("private");
    expect(card.verified).toBe(true);
  });
});
