import { createCliCommands } from "./commands/cli";
import { createGatewayMethods } from "./commands/gateway";
import { createSlashCommands } from "./commands/slash";
import { createBackgroundService } from "./service/background";
import { createTaskRegistry } from "./tasks/registry";
import { createDelegateTool } from "./tools/delegate";
import { createPeersTool } from "./tools/peers";
import { createTasksTool } from "./tools/tasks";
import type { TaskRequest } from "./types/agentpod";

export const workspaceMarker = "agentpod-plugin";

interface PluginApi {
  registerService(service: unknown): void;
  registerCli(name: string, commandSet: object): void;
  registerCommand(name: string, commandSet: object): void;
  registerGatewayMethod(name: string, handler: (...args: any[]) => unknown): void;
  registerTool(name: string, handler: (...args: any[]) => unknown): void;
}

interface PluginOptions {
  statePath: string;
}

export function createAgentPodPlugin(api: PluginApi, options: PluginOptions) {
  const service = createBackgroundService({
    statePath: options.statePath
  });
  const registry = createTaskRegistry();
  const client = {
    async delegate(task: TaskRequest) {
      return {
        task_id: task.task_id,
        status: "queued"
      };
    }
  };

  const cli = createCliCommands(service);
  const slash = createSlashCommands(service);
  const gateway = createGatewayMethods(service);
  const peersTool = createPeersTool(service);
  const delegateTool = createDelegateTool({ client, registry });
  const tasksTool = createTasksTool(registry);

  api.registerService(service);
  api.registerCli("agentpod", cli);
  api.registerCommand("/agentpod", slash);

  for (const [name, handler] of Object.entries(gateway)) {
    api.registerGatewayMethod(name, handler);
  }

  api.registerTool("agentpod_peers", peersTool);
  api.registerTool("agentpod_delegate", delegateTool);
  api.registerTool("agentpod_tasks", tasksTool);

  return {
    service,
    cli,
    slash,
    gateway,
    tools: {
      agentpod_peers: peersTool,
      agentpod_delegate: delegateTool,
      agentpod_tasks: tasksTool
    }
  };
}
