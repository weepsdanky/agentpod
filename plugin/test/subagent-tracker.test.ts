import { describe, expect, it } from "vitest";

import { createSubagentTracker } from "../runtime/subagent-tracker";

describe("AgentPod subagent tracker", () => {
  it("resolves child session keys from spawned hook events", async () => {
    const tracker = createSubagentTracker();
    const pending = tracker.waitForSpawned("run_123", 50);

    tracker.noteSpawned({
      runId: "run_123",
      childSessionKey: "child_123",
      agentId: "agent_local",
      mode: "run",
      threadRequested: false
    });

    await expect(pending).resolves.toMatchObject({
      runId: "run_123",
      childSessionKey: "child_123"
    });
  });

  it("records terminal outcome from subagent end events", () => {
    const tracker = createSubagentTracker();

    tracker.noteEnded({
      runId: "run_456",
      targetSessionKey: "child_456",
      targetKind: "subagent",
      reason: "completed",
      outcome: "ok"
    });

    expect(tracker.getEnded("run_456")).toMatchObject({
      runId: "run_456",
      targetSessionKey: "child_456",
      outcome: "ok"
    });
  });
});
