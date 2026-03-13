import { describe, expect, it, vi } from "vitest";

import { createAgentPodPlugin } from "../index";

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
});
