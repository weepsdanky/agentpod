import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBackgroundService } from "../service/background";
import type { CapabilityManifest, TaskRequest } from "../types/agentpod";

describe("AgentPod background service", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agentpod-service-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("starts and stops cleanly", async () => {
    const service = createBackgroundService({
      statePath: join(tempDir, "state.json")
    });

    expect(service.isRunning()).toBe(false);

    await service.start("public", {
      mode: "managed",
      join_url: "https://agentpod.ai/networks/public"
    });

    expect(service.isRunning()).toBe(true);

    await service.stop();

    expect(service.isRunning()).toBe(false);
  });

  it("loads persisted peer and task state", async () => {
    const statePath = join(tempDir, "state.json");
    await writeFile(
      statePath,
      JSON.stringify({
        activeProfile: "public",
        peers: [{ peer_id: "peer_123" }],
        tasks: [{ task_id: "task_123" }]
      }),
      "utf8"
    );

    const service = createBackgroundService({ statePath });
    await service.load();

    expect(service.snapshot()).toMatchObject({
      activeProfile: "public",
      peers: [{ peer_id: "peer_123" }],
      tasks: [{ task_id: "task_123" }]
    });
  });

  it("rejects activating a second profile while one is already active", async () => {
    const service = createBackgroundService({
      statePath: join(tempDir, "state.json")
    });

    await service.start("public", {
      mode: "managed",
      join_url: "https://agentpod.ai/networks/public"
    });

    await expect(
      service.start("team-a", {
        mode: "private",
        network_id: "team-a",
        base_url: "https://agentpod.internal.example.com"
      })
    ).rejects.toThrow(/only one active profile/i);
  });

  it("publishes manifests and delegates tasks through the client seam", async () => {
    const publishManifest = vi.fn(async () => undefined);
    const listPeers = vi.fn(async () => []);
    const delegate = vi.fn(async () => ({
      task_id: "task_123",
      status: "queued"
    }));
    const subscribeTask = vi.fn(async () => () => undefined);
    const service = createBackgroundService({
      statePath: join(tempDir, "state.json"),
      client: {
        publishManifest,
        listPeers,
        delegate,
        subscribeTask
      }
    });
    const manifest: CapabilityManifest = {
      version: "0.1",
      peer_id: "peer_local",
      issued_at: "2026-03-12T10:40:00Z",
      expires_at: "2026-04-12T10:40:00Z",
      signature: "base64...",
      services: []
    };
    const task: TaskRequest = {
      version: "0.1",
      task_id: "task_123",
      service: "product_brainstorm",
      input: {
        payload: { text: "Help brainstorm the MVP" },
        attachments: []
      },
      delivery: {
        reply: "origin_session",
        artifacts: "inline_only"
      }
    };

    await service.publishManifest(manifest);
    const handle = await service.delegateTask(task);
    await service.subscribeTask("task_123", () => undefined);

    expect(publishManifest).toHaveBeenCalledWith(manifest);
    expect(listPeers).toHaveBeenCalledOnce();
    expect(delegate).toHaveBeenCalledWith(task);
    expect(handle).toEqual({
      task_id: "task_123",
      status: "queued"
    });
    expect(subscribeTask).toHaveBeenCalledWith("task_123", expect.any(Function));
  });
});
