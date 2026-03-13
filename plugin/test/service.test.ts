import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBackgroundService } from "../service/background";

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
});
