import { describe, expect, it } from "vitest";

import { resolveProfile } from "../config";

describe("AgentPod profile resolution", () => {
  it("resolves managed profiles via join_url", async () => {
    const resolved = await resolveProfile(
      {
        mode: "managed",
        join_url: "https://agentpod.ai/networks/public"
      },
      {
        fetchJoinManifest: async (joinUrl) => ({
          network_id: "agentpod-public",
          directory_url: `${joinUrl}/directory`,
          substrate_url: "wss://agentpod.ai/substrate"
        })
      }
    );

    expect(resolved).toMatchObject({
      mode: "managed",
      network_id: "agentpod-public",
      join_url: "https://agentpod.ai/networks/public",
      directory_url: "https://agentpod.ai/networks/public/directory",
      substrate_url: "wss://agentpod.ai/substrate"
    });
  });

  it("derives private profiles from base_url", async () => {
    const resolved = await resolveProfile({
      mode: "private",
      network_id: "team-a",
      base_url: "https://agentpod.internal.example.com"
    });

    expect(resolved).toMatchObject({
      mode: "private",
      network_id: "team-a",
      base_url: "https://agentpod.internal.example.com",
      directory_url: "https://agentpod.internal.example.com/directory",
      substrate_url: "wss://agentpod.internal.example.com/substrate"
    });
  });
});
