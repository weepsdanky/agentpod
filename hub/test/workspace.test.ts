import { describe, expect, it } from "vitest";

import { workspaceMarker } from "../index";

describe("hub workspace", () => {
  it("exports a hub workspace marker", () => {
    expect(workspaceMarker).toBe("agentpod-hub");
  });
});
