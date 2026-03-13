import { describe, expect, it } from "vitest";

import { createExecutionGuard } from "../policy/guard";

describe("AgentPod execution guard", () => {
  it("uses local owner config as the runtime policy authority", () => {
    const guard = createExecutionGuard({
      tool_use: "deny",
      artifacts: "inline_only"
    });

    const effective = guard.resolve({
      serviceDefaults: {
        tool_use: "allow",
        artifact: "allow_links"
      },
      request: {
        tool_use: "ask"
      }
    });

    expect(effective).toEqual({
      tool_use: "deny",
      artifact: "inline_only"
    });
  });
});
