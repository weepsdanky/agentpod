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

  it("registers subagent lifecycle hooks for runtime-backed inbound execution", async () => {
    const registerService = vi.fn();
    const registerCli = vi.fn();
    const registerCommand = vi.fn();
    const registerGatewayMethod = vi.fn();
    const registerTool = vi.fn();
    const registerHook = vi.fn();

    await agentpodPlugin.register?.({
      pluginConfig: {
        statePath: "/tmp/agentpod-state.json"
      },
      runtime: {
        state: {
          resolveStateDir: () => "/tmp"
        },
        subagent: {
          run: vi.fn(async () => ({ runId: "run_123" })),
          waitForRun: vi.fn(),
          getSessionMessages: vi.fn(),
          getSession: vi.fn(),
          deleteSession: vi.fn()
        }
      },
      registerService,
      registerCli,
      registerCommand,
      registerGatewayMethod,
      registerTool,
      registerHook
    } as any);

    expect(registerHook).toHaveBeenCalledWith(
      "subagent_spawned",
      expect.any(Function),
      expect.anything()
    );
    expect(registerHook).toHaveBeenCalledWith(
      "subagent_ended",
      expect.any(Function),
      expect.anything()
    );
  });

  it("routes text args through the fallback agentpod command", async () => {
    const registerCommand = vi.fn();

    await agentpodPlugin.register?.({
      pluginConfig: {
        statePath: "/tmp/agentpod-state.json",
        hubBaseUrl: "http://127.0.0.1:4590"
      },
      registerService: vi.fn(),
      registerCli: vi.fn(),
      registerCommand,
      registerGatewayMethod: vi.fn(),
      registerTool: vi.fn()
    } as any);

    const commandDef = registerCommand.mock.calls.find((call) => call[0]?.name === "agentpod")?.[0];
    expect(commandDef).toBeTruthy();

    const peersResult = await commandDef.handler({ args: "peers" });
    expect(() => JSON.parse(peersResult.text)).not.toThrow();

    const joinResult = await commandDef.handler({
      args: "join team-a --base-url http://127.0.0.1:4590 --network-id team-a"
    });
    expect(JSON.parse(joinResult.text)).toMatchObject({
      ok: true,
      profileName: "team-a",
      network_id: "team-a"
    });
  });

  it("registers real CLI subcommands for peers, tasks, and leave", async () => {
    const command = {
      description: vi.fn(() => command),
      argument: vi.fn(() => command),
      option: vi.fn(() => command),
      action: vi.fn(() => command),
      command: vi.fn(() => command)
    };
    const program = {
      command: vi.fn(() => command)
    };

    await agentpodPlugin.register?.({
      pluginConfig: {
        statePath: "/tmp/agentpod-state.json",
        hubBaseUrl: "http://127.0.0.1:4590"
      },
      registerService: vi.fn(),
      registerCli: (registrar: ({ program }: any) => void, options?: { commands?: string[] }) => {
        expect(options?.commands).toEqual(["agentpod"]);
        registrar({ program });
      },
      registerCommand: vi.fn(),
      registerGatewayMethod: vi.fn(),
      registerTool: vi.fn()
    } as any);

    const subcommands = (command.command.mock.calls as Array<[string, ...unknown[]]>).map(
      (call) => call[0]
    );
    expect(subcommands).toEqual(expect.arrayContaining(["join", "publish", "peers", "tasks", "leave"]));
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
      agentpodDocPath: {
        type: "string"
      },
      identityPath: {
        type: "string"
      },
      hubBaseUrl: {
        type: "string"
      },
      pluginToken: {
        type: "string"
      },
      runtimeSessionKey: {
        type: "string"
      }
    });
    expect(manifest.configSchema?.required).toEqual([]);
  });
});
