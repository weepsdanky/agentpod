import { describe, expect, it, vi } from "vitest";

import { createSubagentTracker } from "../runtime/subagent-tracker";
import { createRuntimeSubagentExecutor } from "../runtime/subagent-executor";

describe("AgentPod runtime subagent executor", () => {
  it("starts a real runtime subagent and waits for the spawned child session", async () => {
    const tracker = createSubagentTracker();
    const run = vi.fn(async () => ({ runId: "run_123" }));
    const executor = createRuntimeSubagentExecutor({
      sessionKey: "owner_session",
      runtime: {
        run
      },
      tracker
    });

    const pending = executor.execute({
      taskId: "task_123",
      service: "product_brainstorm",
      payload: { text: "Help brainstorm the MVP" },
      attachments: []
    });

    tracker.noteSpawned({
      runId: "run_123",
      childSessionKey: "child_123",
      agentId: "agent_local",
      label: "agentpod/task_123",
      mode: "run",
      threadRequested: false
    });

    await expect(pending).resolves.toEqual({
      runId: "run_123",
      childSessionKey: "child_123"
    });
    expect(run).toHaveBeenCalledWith({
      sessionKey: "owner_session",
      message: expect.stringContaining("product_brainstorm"),
      idempotencyKey: "agentpod:task_123"
    });
  });

  it("waits for completion and synthesizes a task result from child session messages", async () => {
    const tracker = createSubagentTracker();
    const executor = createRuntimeSubagentExecutor({
      sessionKey: "owner_session",
      runtime: {
        run: vi.fn(async () => ({ runId: "unused" })),
        waitForRun: vi.fn(async () => ({ status: "ok" as const })),
        getSessionMessages: vi.fn(async () => ({
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Here is the completed draft review."
                }
              ]
            }
          ]
        }))
      },
      tracker
    });

    await expect(
      executor.awaitResult({
        taskId: "task_456",
        runId: "run_456",
        childSessionKey: "child_456"
      })
    ).resolves.toEqual({
      version: "0.1",
      task_id: "task_456",
      status: "completed",
      output: {
        text: "Here is the completed draft review."
      },
      artifacts: [],
      execution_summary: {
        used_tools: [],
        used_network: false
      }
    });
  });
});
