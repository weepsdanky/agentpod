import { describe, expect, it, vi } from "vitest";

import { createCliCommands } from "../commands/cli";
import { createSlashCommands } from "../commands/slash";
import type { ManagedNetworkProfile, PrivateNetworkProfile } from "../types/agentpod";

type JoinProfile = ManagedNetworkProfile | PrivateNetworkProfile;

function createServiceDouble() {
  return {
    start: vi.fn(async (profileName: string, profile: JoinProfile) => ({
      profileName,
      profile,
      network_id: profile.mode === "managed" ? "agentpod-public" : profile.network_id,
      directory_url:
        profile.mode === "managed"
          ? "https://agentpod.ai/directory"
          : "https://agentpod.internal.example.com/directory",
      substrate_url:
        profile.mode === "managed"
          ? "wss://agentpod.ai/substrate"
          : "wss://agentpod.internal.example.com/substrate"
    })),
    stop: vi.fn(async () => undefined),
    publishFromSource: vi.fn(async () => ({
      ok: true as const,
      peer_id: "peer_local",
      service_count: 2,
      peer_count: 1
    })),
    snapshot: vi.fn(() => ({
      activeProfile: "public",
      peers: [{ peer_id: "peer_123" }],
      tasks: [{ task_id: "task_123" }]
    }))
  };
}

describe("AgentPod owner-facing commands", () => {
  it("handles /agentpod join for managed and private profiles", async () => {
    const service = createServiceDouble();
    const commands = createSlashCommands(service);

    const managed = await commands.join({
      profileName: "public",
      joinUrl: "https://agentpod.ai/networks/public"
    });
    const privateJoin = await commands.join({
      profileName: "team-a",
      networkId: "team-a",
      baseUrl: "https://agentpod.internal.example.com"
    });

    expect(service.start).toHaveBeenNthCalledWith(1, "public", {
      mode: "managed",
      join_url: "https://agentpod.ai/networks/public"
    });
    expect(service.start).toHaveBeenNthCalledWith(2, "team-a", {
      mode: "private",
      network_id: "team-a",
      base_url: "https://agentpod.internal.example.com"
    });
    expect(managed).toMatchObject({
      ok: true,
      profileName: "public",
      network_id: "agentpod-public"
    });
    expect(privateJoin).toMatchObject({
      ok: true,
      profileName: "team-a",
      network_id: "team-a"
    });
  });

  it("handles /agentpod leave, peers, and tasks", async () => {
    const service = createServiceDouble();
    const commands = createSlashCommands(service);

    await expect(commands.leave()).resolves.toEqual({ ok: true });
    await expect(commands.peers()).resolves.toEqual([{ peer_id: "peer_123" }]);
    await expect(commands.tasks()).resolves.toEqual([{ task_id: "task_123" }]);

    expect(service.stop).toHaveBeenCalledOnce();
  });

  it("handles /agentpod publish", async () => {
    const service = createServiceDouble();
    const commands = createSlashCommands(service);

    await expect(commands.publish()).resolves.toEqual({
      ok: true,
      peer_id: "peer_local",
      service_count: 2,
      peer_count: 1
    });
    expect(service.publishFromSource).toHaveBeenCalledOnce();
  });

  it("supports CLI join output", async () => {
    const service = createServiceDouble();
    const cli = createCliCommands(service);

    const result = await cli.join({
      profileName: "public",
      joinUrl: "https://agentpod.ai/networks/public"
    });

    expect(result).toMatchObject({
      ok: true,
      profileName: "public",
      network_id: "agentpod-public"
    });
  });

  it("supports CLI publish output", async () => {
    const service = createServiceDouble();
    const cli = createCliCommands(service);

    await expect(cli.publish()).resolves.toEqual({
      ok: true,
      peer_id: "peer_local",
      service_count: 2,
      peer_count: 1
    });
  });
});
