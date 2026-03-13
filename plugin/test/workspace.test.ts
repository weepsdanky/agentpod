import { access } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { workspaceMarker } from "../index";

describe("plugin workspace", () => {
  it("exports a plugin workspace marker", () => {
    expect(workspaceMarker).toBe("agentpod-plugin");
  });

  it("includes the documented local-dev scripts and examples", async () => {
    await expect(access(new URL("../../scripts/dev-openclaw-link.sh", import.meta.url))).resolves.toBeUndefined();
    await expect(access(new URL("../../scripts/dev-openagents-config.md", import.meta.url))).resolves.toBeUndefined();
    await expect(access(new URL("../../scripts/dev-public-directory.md", import.meta.url))).resolves.toBeUndefined();
    await expect(access(new URL("../../scripts/dev-private-hub.md", import.meta.url))).resolves.toBeUndefined();
    await expect(access(new URL("../../docs/AGENTPOD.md.template", import.meta.url))).resolves.toBeUndefined();
    await expect(access(new URL("../../examples/managed-public/README.md", import.meta.url))).resolves.toBeUndefined();
    await expect(access(new URL("../../examples/managed-public/openclaw.json", import.meta.url))).resolves.toBeUndefined();
    await expect(access(new URL("../../examples/self-hosted-private/README.md", import.meta.url))).resolves.toBeUndefined();
    await expect(access(new URL("../../examples/self-hosted-private/openclaw.json", import.meta.url))).resolves.toBeUndefined();
    await expect(access(new URL("../../examples/private-minimal/README.md", import.meta.url))).resolves.toBeUndefined();
    await expect(access(new URL("../../examples/private-minimal/openclaw.json", import.meta.url))).resolves.toBeUndefined();
  });
});
