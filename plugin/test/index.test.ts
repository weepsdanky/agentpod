import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import agentpodPlugin, { createAgentPodPlugin } from "../index";

describe("AgentPod plugin entrypoint", () => {
  it("registers services, commands, gateway methods, and tools", () => {
    const registerService = vi.fn();
    const registerCli = vi.fn();
    const registerCommand = vi.fn();
    const registerGatewayMethod = vi.fn();
    const registerTool = vi.fn();

    createAgentPodPlugin(
      {
        registerService,
        registerCli,
        registerCommand,
        registerGatewayMethod,
        registerTool
      },
      {
        statePath: "/tmp/agentpod-state.json"
      }
    );

    expect(registerService).toHaveBeenCalledOnce();
    expect(registerCli).toHaveBeenCalledWith("agentpod", expect.any(Object));
    expect(registerCommand).toHaveBeenCalledWith("/agentpod", expect.any(Object));
    expect(registerGatewayMethod).toHaveBeenCalledWith("agentpod.status", expect.any(Function));
    expect(registerGatewayMethod).toHaveBeenCalledWith(
      "agentpod.network.join",
      expect.any(Function)
    );
    expect(registerTool).toHaveBeenCalledWith("agentpod_peers", expect.any(Function));
    expect(registerTool).toHaveBeenCalledWith("agentpod_delegate", expect.any(Function));
    expect(registerTool).toHaveBeenCalledWith("agentpod_tasks", expect.any(Function));
  });

  it("exports an OpenClaw-compatible default plugin object", () => {
    expect(agentpodPlugin).toMatchObject({
      id: "agentpod",
      name: "AgentPod",
      description: expect.any(String),
      configSchema: expect.any(Object),
      register: expect.any(Function)
    });
  });

  it("declares openclaw.extensions in plugin package metadata", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8")
    ) as {
      openclaw?: {
        extensions?: string[];
      };
    };

    expect(packageJson.openclaw?.extensions).toEqual(["./index.ts"]);
  });

  it("documents the minimum local-dev config schema in the plugin manifest", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../openclaw.plugin.json", import.meta.url), "utf8")
    ) as {
      configSchema?: {
        properties?: Record<string, unknown>;
        required?: string[];
      };
    };

    expect(manifest.configSchema?.properties).toMatchObject({
      statePath: {
        type: "string"
      },
      hubBaseUrl: {
        type: "string"
      },
      pluginToken: {
        type: "string"
      }
    });
    expect(manifest.configSchema?.required).toEqual([]);
  });
});
