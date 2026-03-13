import { describe, expect, it, vi } from "vitest";

import { normalizeArtifactsForDelivery } from "../artifacts/bridge";
import { createExecutionGuard } from "../policy/guard";
import { createTaskRegistry } from "../tasks/registry";
import { createTaskRunner } from "../tasks/runner";
import type { ArtifactRef, TaskRequest } from "../types/agentpod";

describe("AgentPod task runner", () => {
  it("does not execute a duplicate inbound task twice", async () => {
    const registry = createTaskRegistry();
    const spawnSession = vi.fn(async () => ({ childSessionKey: "child_123" }));
    const runner = createTaskRunner({
      registry,
      spawnSession,
      executionGuard: createExecutionGuard({})
    });
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

    const first = await runner.accept(task);
    const second = await runner.accept(task);

    expect(first).toMatchObject({ accepted: true, childSessionKey: "child_123" });
    expect(second).toEqual({ accepted: false, reason: "duplicate_task" });
    expect(spawnSession).toHaveBeenCalledOnce();
  });

  it("creates a dedicated spawned task session for accepted work", async () => {
    const registry = createTaskRegistry();
    const spawnSession = vi.fn(async () => ({ childSessionKey: "child_456" }));
    const runner = createTaskRunner({
      registry,
      spawnSession,
      executionGuard: createExecutionGuard({})
    });
    const task: TaskRequest = {
      version: "0.1",
      task_id: "task_456",
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

    await expect(runner.accept(task)).resolves.toMatchObject({
      accepted: true,
      childSessionKey: "child_456"
    });
    expect(spawnSession).toHaveBeenCalledWith({
      taskId: "task_456",
      service: "draft_review",
      payload: { text: "Review this draft" },
      attachments: []
    });
  });

  it("enforces artifact policy for inline versus relay-backed delivery", () => {
    const artifacts: ArtifactRef[] = [
      {
        kind: "inline",
        name: "summary.md",
        content: "Inline summary"
      },
      {
        kind: "relay",
        name: "report.pdf",
        url: "https://agentpod.ai/artifacts/report.pdf"
      }
    ];

    expect(normalizeArtifactsForDelivery("inline_only", artifacts)).toEqual([
      {
        kind: "inline",
        name: "summary.md",
        content: "Inline summary"
      }
    ]);
    expect(normalizeArtifactsForDelivery("allow_links", artifacts)).toEqual(artifacts);
  });
});
