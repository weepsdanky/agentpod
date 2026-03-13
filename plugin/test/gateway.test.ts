import { describe, expect, it, vi } from "vitest";

import { createGatewayMethods } from "../commands/gateway";
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
      tasks: [{ task_id: "task_123" }],
      resolvedProfile: {
        mode: "managed",
        join_url: "https://agentpod.ai/networks/public",
        network_id: "agentpod-public",
        directory_url: "https://agentpod.ai/directory",
        substrate_url: "wss://agentpod.ai/substrate"
      }
    }))
  };
}

describe("AgentPod gateway methods", () => {
  it("returns status, peers, and tasks from service state", async () => {
    const methods = createGatewayMethods(createServiceDouble());

    await expect(methods["agentpod.status"]()).resolves.toMatchObject({
      activeProfile: "public",
      resolvedProfile: {
        network_id: "agentpod-public"
      }
    });
    await expect(methods["agentpod.peers.list"]()).resolves.toEqual([{ peer_id: "peer_123" }]);
    await expect(methods["agentpod.tasks.list"]()).resolves.toEqual([{ task_id: "task_123" }]);
  });

  it("supports managed and private join plus leave", async () => {
    const service = createServiceDouble();
    const methods = createGatewayMethods(service);

    const managed = await methods["agentpod.network.join"]({
      profileName: "public",
      joinUrl: "https://agentpod.ai/networks/public"
    });
    const privateJoin = await methods["agentpod.network.join"]({
      profileName: "team-a",
      networkId: "team-a",
      baseUrl: "https://agentpod.internal.example.com"
    });
    const leave = await methods["agentpod.network.leave"]();

    expect(service.start).toHaveBeenNthCalledWith(1, "public", {
      mode: "managed",
      join_url: "https://agentpod.ai/networks/public"
    });
    expect(service.start).toHaveBeenNthCalledWith(2, "team-a", {
      mode: "private",
      network_id: "team-a",
      base_url: "https://agentpod.internal.example.com"
    });
    expect(managed).toMatchObject({ ok: true, network_id: "agentpod-public" });
    expect(privateJoin).toMatchObject({ ok: true, network_id: "team-a" });
    expect(leave).toEqual({ ok: true });
    expect(service.stop).toHaveBeenCalledOnce();
  });

  it("exposes publish through the gateway surface", async () => {
    const service = createServiceDouble();
    const methods = createGatewayMethods(service);

    await expect(methods["agentpod.publish"]()).resolves.toEqual({
      ok: true,
      peer_id: "peer_local",
      service_count: 2,
      peer_count: 1
    });
    expect(service.publishFromSource).toHaveBeenCalledOnce();
  });
});
