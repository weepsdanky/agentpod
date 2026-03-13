import { describe, expect, it } from "vitest";

import { parseHubCliArgs } from "../index";

describe("AgentPod hub CLI", () => {
  it("parses a minimal private-hub command line", () => {
    expect(
      parseHubCliArgs([
        "--bind",
        "127.0.0.1:4590",
        "--mode",
        "private",
        "--network-id",
        "team-a"
      ])
    ).toMatchObject({
      bindHost: "127.0.0.1",
      port: 4590,
      mode: "private",
      networkId: "team-a",
      directoryUrl: "http://127.0.0.1:4590/directory",
      substrateUrl: "ws://127.0.0.1:4590/substrate"
    });
  });

  it("ignores a leading pnpm argument separator before --help", () => {
    expect(parseHubCliArgs(["--", "--help"]).help).toBe(true);
  });
});
