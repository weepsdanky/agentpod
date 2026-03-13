import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

  it("reuses a persisted local peer identity across service restarts", async () => {
    const statePath = join(tempDir, "state.json");
    const identityPath = join(tempDir, "identity.json");
    const firstService = createBackgroundService({
      statePath,
      identityPath
    });
    const firstIdentity = firstService.snapshot().identity;
    const secondService = createBackgroundService({
      statePath,
      identityPath
    });
    const secondIdentity = secondService.snapshot().identity;

    expect(firstIdentity.peer_id).toMatch(/^peer_/);
    expect(secondIdentity).toEqual(firstIdentity);
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

  it("accepts inbound tasks through a runtime-backed runner", async () => {
    const accept = vi.fn(async () => ({
      accepted: true as const,
      childSessionKey: "child_inbound_123",
      runId: "run_inbound_123"
    }));
    const service = createBackgroundService({
      statePath: join(tempDir, "state.json"),
      inboundRunner: {
        accept
      }
    });
    const task: TaskRequest = {
      version: "0.1",
      task_id: "task_inbound_123",
      service: "product_brainstorm",
      input: {
        payload: { text: "Handle this inbound request" },
        attachments: []
      },
      delivery: {
        reply: "origin_session",
        artifacts: "inline_only"
      }
    };

    await expect((service as any).acceptInboundTask(task)).resolves.toEqual({
      accepted: true,
      childSessionKey: "child_inbound_123",
      runId: "run_inbound_123"
    });
    expect(accept).toHaveBeenCalledWith(task);
    expect(service.snapshot()).toMatchObject({
      tasks: [
        {
          task_id: "task_inbound_123",
          status: "running",
          direction: "inbound",
          childSessionKey: "child_inbound_123"
        }
      ]
    });
  });

  it("streams running and final result events for inbound work", async () => {
    const accept = vi.fn(async () => ({
      accepted: true as const,
      childSessionKey: "child_inbound_456",
      runId: "run_inbound_456"
    }));
    const awaitResult = vi.fn(async () => ({
      version: "0.1" as const,
      task_id: "task_inbound_456",
      status: "completed" as const,
      output: {
        text: "Inbound task finished"
      },
      artifacts: [],
      execution_summary: {
        used_tools: [],
        used_network: false
      }
    }));
    const service = createBackgroundService({
      statePath: join(tempDir, "state.json"),
      inboundRunner: {
        accept,
        awaitResult
      }
    });
    const task: TaskRequest = {
      version: "0.1",
      task_id: "task_inbound_456",
      service: "draft_review",
      input: {
        payload: { text: "Review this draft" },
        attachments: []
      },
      delivery: {
        reply: "origin_session",
        artifacts: "inline_only"
      }
    };
    const events: Array<{ kind: string; data: unknown }> = [];

    await expect(
      (service as any).executeInboundTask(task, (event: { kind: string; data: unknown }) => {
        events.push(event);
      })
    ).resolves.toEqual({
      accepted: true,
      childSessionKey: "child_inbound_456",
      runId: "run_inbound_456"
    });

    expect(awaitResult).toHaveBeenCalledWith({
      task,
      childSessionKey: "child_inbound_456",
      runId: "run_inbound_456"
    });
    expect(events).toEqual([
      {
        kind: "update",
        data: expect.objectContaining({
          version: "0.1",
          task_id: "task_inbound_456",
          state: "running",
          message: "Spawned local subagent session"
        })
      },
      {
        kind: "result",
        data: {
          version: "0.1",
          task_id: "task_inbound_456",
          status: "completed",
          output: {
            text: "Inbound task finished"
          },
          artifacts: [],
          execution_summary: {
            used_tools: [],
            used_network: false
          }
        }
      }
    ]);
  });

  it("pulls mailbox work from the hub and pushes runtime events back", async () => {
    const task: TaskRequest = {
      version: "0.1",
      task_id: "task_mailbox_456",
      target_peer_id: "peer_mailbox",
      service: "draft_review",
      input: {
        payload: { text: "Process this mailbox task" },
        attachments: []
      },
      delivery: {
        reply: "origin_session",
        artifacts: "inline_only"
      }
    };
    const publishTaskEvent = vi.fn(async () => undefined);
    const claimInboundTask = vi
      .fn<() => Promise<TaskRequest | null>>()
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce(null);
    const service = createBackgroundService({
      statePath: join(tempDir, "state.json"),
      autoPoll: false,
      pollIntervalMs: 5,
      client: {
        publishManifest: vi.fn(async () => undefined),
        listPeers: vi.fn(async () => []),
        delegate: vi.fn(async () => ({
          task_id: "unused",
          status: "queued"
        })),
        subscribeTask: vi.fn(async () => () => undefined),
        claimInboundTask,
        publishTaskEvent
      },
      inboundRunner: {
        accept: vi.fn(async () => ({
          accepted: true as const,
          childSessionKey: "child_mailbox_456",
          runId: "run_mailbox_456"
        })),
        awaitResult: vi.fn(async () => ({
          version: "0.1" as const,
          task_id: "task_mailbox_456",
          status: "completed" as const,
          output: {
            text: "Mailbox execution complete"
          },
          artifacts: [],
          execution_summary: {
            used_tools: [],
            used_network: false
          }
        }))
      }
    });

    await service.start("public", {
      mode: "managed",
      join_url: "https://agentpod.ai/networks/public"
    });
    await (service as any).processMailboxOnce();

    expect(claimInboundTask).toHaveBeenCalledWith(expect.stringMatching(/^peer_/));
    expect(publishTaskEvent).toHaveBeenCalledTimes(2);
    expect(publishTaskEvent).toHaveBeenNthCalledWith(
      1,
      "task_mailbox_456",
      expect.objectContaining({
        version: "0.1",
        task_id: "task_mailbox_456",
        state: "running"
      })
    );
    expect(publishTaskEvent).toHaveBeenNthCalledWith(
      2,
      "task_mailbox_456",
      {
        version: "0.1",
        task_id: "task_mailbox_456",
        status: "completed",
        output: {
          text: "Mailbox execution complete"
        },
        artifacts: [],
        execution_summary: {
          used_tools: [],
          used_network: false
        }
      }
    );
  });

  it("publishes a compiled manifest from AGENTPOD.md", async () => {
    const publishManifest = vi.fn(async () => undefined);
    const listPeers = vi.fn(async () => [
      {
        peer_id: "peer_123",
        network_id: "agentpod-public",
        display_name: "Design Peer",
        public_key: "base64...",
        key_fingerprint: "sha256:abcd...",
        trust_signals: ["operator_verified"],
        last_seen_at: "2026-03-12T10:54:00Z"
      }
    ]);
    const sourcePath = join(tempDir, "AGENTPOD.md");

    await writeFile(
      sourcePath,
      `# Summary

Helps with product brainstorming.

# Services

## product_brainstorm
- summary: Structure early product ideas.
- when to use: Use when exploring a draft MVP.

# Inputs
- accepted payload types: \`text/plain\`
- accepted attachment types: \`application/pdf\`

# Outputs
- result types: \`text/markdown\`
- artifact behavior: inline summary by default

# Safety
- notable limits: Does not perform irreversible external actions.
`,
      "utf8"
    );

    const service = createBackgroundService({
      statePath: join(tempDir, "state.json"),
      agentpodDocPath: sourcePath,
      client: {
        publishManifest,
        listPeers,
        delegate: vi.fn(async () => ({
          task_id: "unused",
          status: "queued"
        })),
        subscribeTask: vi.fn(async () => () => undefined)
      }
    });

    const result = await service.publishFromSource();

    expect(publishManifest).toHaveBeenCalledOnce();
    expect(publishManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        version: "0.1",
        peer_id: expect.stringMatching(/^peer_/),
        services: [
          expect.objectContaining({
            id: "product_brainstorm"
          })
        ]
      })
    );
    expect(result).toEqual({
      ok: true,
      peer_id: expect.stringMatching(/^peer_/),
      service_count: 1,
      peer_count: 1
    });
    await expect(readFile(sourcePath, "utf8")).resolves.toContain("# Summary");
  });

  it("blocks publication when AGENTPOD.md is invalid", async () => {
    const publishManifest = vi.fn(async () => undefined);
    const sourcePath = join(tempDir, "AGENTPOD.md");

    await writeFile(sourcePath, "# Summary\n\nMissing required sections.\n", "utf8");

    const service = createBackgroundService({
      statePath: join(tempDir, "state.json"),
      agentpodDocPath: sourcePath,
      client: {
        publishManifest,
        listPeers: vi.fn(async () => []),
        delegate: vi.fn(async () => ({
          task_id: "unused",
          status: "queued"
        })),
        subscribeTask: vi.fn(async () => () => undefined)
      }
    });

    await expect(service.publishFromSource()).rejects.toThrow(/missing required section/i);
    expect(publishManifest).not.toHaveBeenCalled();
  });
});
