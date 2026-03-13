import { describe, expect, it } from "vitest";

import { workspaceMarker } from "../index";

describe("plugin workspace", () => {
  it("exports a plugin workspace marker", () => {
    expect(workspaceMarker).toBe("agentpod-plugin");
  });
});
