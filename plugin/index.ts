import { createAgentPodClient, createHttpAgentPodTransport } from "./client";
import { createCliCommands } from "./commands/cli";
import { createGatewayMethods } from "./commands/gateway";
import { createSlashCommands } from "./commands/slash";
import { createBackgroundService } from "./service/background";
import { createTaskRegistry } from "./tasks/registry";
import { createDelegateTool } from "./tools/delegate";
import { createPeersTool } from "./tools/peers";
import { createTasksTool } from "./tools/tasks";
import type { ManagedNetworkProfile, PrivateNetworkProfile, TaskRequest } from "./types/agentpod";

export const workspaceMarker = "agentpod-plugin";

const agentpodPluginConfigSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    statePath: {
      type: "string"
    },
    hubBaseUrl: {
      type: "string"
    },
    pluginToken: {
      type: "string"
    },
    autoJoinProfile: {
      type: "string"
    },
    profiles: {
      type: "object",
      additionalProperties: true
    }
  },
  required: []
} as const;

interface LegacyPluginApi {
  registerService(service: unknown): void;
  registerCli(name: string, commandSet: object): void;
  registerCommand(name: string, commandSet: object): void;
  registerGatewayMethod(name: string, handler: (...args: any[]) => unknown): void;
  registerTool(name: string, handler: (...args: any[]) => unknown): void;
}

interface PluginOptions {
  statePath: string;
}

interface OpenClawLikeApi {
  pluginConfig?: Record<string, unknown>;
  runtime?: {
    state?: {
      resolveStateDir?: () => string;
    };
  };
  registerService(service: {
    id: string;
    start: () => Promise<void>;
    stop: () => Promise<void>;
  }): void;
  registerCli(
    registrar: (ctx: { program: CliProgramLike }) => void,
    opts?: { commands?: string[] }
  ): void;
  registerCommand(command: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    handler: (ctx: { args?: string }) => Promise<{ text: string }> | { text: string };
  }): void;
  registerGatewayMethod(
    name: string,
    handler: (ctx: {
      params?: Record<string, unknown>;
      respond: (ok: boolean, payload: unknown) => void;
    }) => void | Promise<void>
  ): void;
  registerTool(
    tool: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
      execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{
        content: Array<{ type: "text"; text: string }>;
      }>;
    },
    opts?: {
      optional?: boolean;
    }
  ): void;
}

interface CliProgramLike {
  command(name: string): CliCommandLike;
}

interface CliCommandLike {
  command(name: string): CliCommandLike;
  description(text: string): CliCommandLike;
  option(flag: string, description: string): CliCommandLike;
  argument(name: string, description?: string): CliCommandLike;
  action(handler: (...args: any[]) => unknown): CliCommandLike;
}

type JoinProfile = ManagedNetworkProfile | PrivateNetworkProfile;

export function createAgentPodPlugin(api: LegacyPluginApi, options: PluginOptions) {
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

const agentpodPlugin = {
  id: "agentpod",
  name: "AgentPod",
  description: "Thin AgentPod peer-network plugin for OpenClaw.",
  configSchema: agentpodPluginConfigSchema,
  register(api: OpenClawLikeApi) {
    const pluginConfig = resolvePluginConfig(api.pluginConfig, api.runtime?.state?.resolveStateDir);
    const client = pluginConfig.hubBaseUrl
      ? createAgentPodClient(
          createHttpAgentPodTransport({
            baseUrl: pluginConfig.hubBaseUrl
          })
        )
      : undefined;
    const service = createBackgroundService({
      statePath: pluginConfig.statePath,
      client
    });
    const registry = createTaskRegistry();
    const cli = createCliCommands(service);
    const slash = createSlashCommands(service);
    const gateway = createGatewayMethods(service);
    const peersTool = createPeersTool(service);
    const delegateTool = createDelegateTool({
      client: client ?? {
        async delegate(task: TaskRequest) {
          return {
            task_id: task.task_id,
            status: "queued"
          };
        }
      },
      registry
    });
    const tasksTool = createTasksTool(registry);

    api.registerService({
      id: "agentpod",
      start: async () => {
        const autoJoinProfile = pluginConfig.autoJoinProfile;
        if (!autoJoinProfile) {
          return;
        }

        const profile = pluginConfig.profiles[autoJoinProfile];
        if (profile) {
          await service.start(autoJoinProfile, profile);
        }
      },
      stop: async () => {
        await service.stop();
      }
    });

    api.registerCli(({ program }) => {
      registerAgentPodCli(program, cli);
    }, { commands: ["agentpod"] });

    api.registerCommand({
      name: "agentpod",
      description: "Manage AgentPod network state",
      acceptsArgs: true,
      handler: async (ctx) => ({
        text: JSON.stringify(await runSlashFromArgs(slash, ctx.args ?? "status"), null, 2)
      })
    });

    for (const [name, handler] of Object.entries(gateway)) {
      api.registerGatewayMethod(name, async ({ params, respond }) => {
        respond(true, await handler(params as never));
      });
    }

    api.registerTool(
      {
        name: "agentpod_peers",
        description: "List cached AgentPod peers.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {}
        },
        async execute() {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await peersTool(), null, 2)
              }
            ]
          };
        }
      },
      { optional: true }
    );

    api.registerTool(
      {
        name: "agentpod_delegate",
        description: "Delegate a task to a remote AgentPod peer.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            task: {
              type: "object",
              additionalProperties: true
            }
          },
          required: ["task"]
        },
        async execute(_toolCallId, params) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  await delegateTool(params.task as TaskRequest),
                  null,
                  2
                )
              }
            ]
          };
        }
      },
      { optional: true }
    );

    api.registerTool(
      {
        name: "agentpod_tasks",
        description: "List locally tracked AgentPod task handles.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {}
        },
        async execute() {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await tasksTool(), null, 2)
              }
            ]
          };
        }
      },
      { optional: true }
    );
  }
};

function resolvePluginConfig(
  pluginConfig: Record<string, unknown> | undefined,
  resolveStateDir: (() => string) | undefined
) {
  const fallbackStateDir = resolveStateDir?.() ?? ".openclaw/state";
  const profiles = readProfiles(pluginConfig?.profiles);

  return {
    statePath:
      typeof pluginConfig?.statePath === "string"
        ? pluginConfig.statePath
        : `${fallbackStateDir.replace(/\/+$/, "")}/agentpod-state.json`,
    hubBaseUrl:
      typeof pluginConfig?.hubBaseUrl === "string" ? pluginConfig.hubBaseUrl : undefined,
    pluginToken:
      typeof pluginConfig?.pluginToken === "string" ? pluginConfig.pluginToken : undefined,
    autoJoinProfile:
      typeof pluginConfig?.autoJoinProfile === "string"
        ? pluginConfig.autoJoinProfile
        : undefined,
    profiles
  };
}

function readProfiles(value: unknown): Record<string, JoinProfile> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const profiles: Record<string, JoinProfile> = {};
  for (const [profileName, rawProfile] of Object.entries(value)) {
    if (!rawProfile || typeof rawProfile !== "object") {
      continue;
    }

    const mode = (rawProfile as { mode?: unknown }).mode;
    if (mode === "managed" && typeof (rawProfile as { join_url?: unknown }).join_url === "string") {
      profiles[profileName] = {
        mode: "managed",
        join_url: (rawProfile as { join_url: string }).join_url
      };
      continue;
    }

    if (
      mode === "private" &&
      typeof (rawProfile as { network_id?: unknown }).network_id === "string" &&
      typeof (rawProfile as { base_url?: unknown }).base_url === "string"
    ) {
      profiles[profileName] = {
        mode: "private",
        network_id: (rawProfile as { network_id: string }).network_id,
        base_url: (rawProfile as { base_url: string }).base_url
      };
    }
  }

  return profiles;
}

function registerAgentPodCli(program: CliProgramLike, cli: ReturnType<typeof createCliCommands>) {
  program
    .command("agentpod")
    .description("Manage AgentPod network state")
    .command("join")
    .description("Join an AgentPod network")
    .argument("<profileName>", "profile name")
    .option("--join-url <joinUrl>", "managed join URL")
    .option("--network-id <networkId>", "private network id")
    .option("--base-url <baseUrl>", "private hub base URL")
    .action(async (profileName: string, options: Record<string, string | undefined>) => {
      const result = await cli.join({
        profileName,
        joinUrl: options.joinUrl,
        networkId: options.networkId,
        baseUrl: options.baseUrl
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    });
}

async function runSlashFromArgs(
  slash: ReturnType<typeof createSlashCommands>,
  args: string
) {
  const [command = "status", ...rest] = args.trim().split(/\s+/).filter(Boolean);

  if (command === "join") {
    const [profileName = "default", profileKind, profileValue] = rest;

    if (profileKind === "--join-url" && profileValue) {
      return slash.join({
        profileName,
        joinUrl: profileValue
      });
    }

    if (profileKind === "--base-url" && profileValue) {
      return slash.join({
        profileName,
        networkId: profileName,
        baseUrl: profileValue
      });
    }

    throw new Error("join requires --join-url or --base-url");
  }

  if (command === "leave") {
    return slash.leave();
  }

  if (command === "peers") {
    return slash.peers();
  }

  if (command === "tasks") {
    return slash.tasks();
  }

  return {
    peers: await slash.peers(),
    tasks: await slash.tasks()
  };
}

export default agentpodPlugin;
