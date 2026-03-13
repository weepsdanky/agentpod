import { createAgentPodClient, createHttpAgentPodTransport } from "./client";
import { createCliCommands } from "./commands/cli";
import { createGatewayMethods } from "./commands/gateway";
import { createSlashCommands } from "./commands/slash";
import { createExecutionGuard } from "./policy/guard";
import { createRuntimeSubagentExecutor } from "./runtime/subagent-executor";
import { createSubagentTracker } from "./runtime/subagent-tracker";
import { createBackgroundService } from "./service/background";
import { createTaskRegistry } from "./tasks/registry";
import { createTaskRunner } from "./tasks/runner";
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
    identityPath: {
      type: "string"
    },
    agentpodDocPath: {
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
  identityPath?: string;
  agentpodDocPath?: string;
}

interface OpenClawLikeApi {
  pluginConfig?: Record<string, unknown>;
  runtime?: {
    state?: {
      resolveStateDir?: () => string;
    };
    subagent?: {
      run: (params: {
        sessionKey: string;
        message: string;
        extraSystemPrompt?: string;
        lane?: string;
        deliver?: boolean;
        idempotencyKey?: string;
      }) => Promise<{ runId: string }>;
      waitForRun?: (params: {
        runId: string;
        timeoutMs?: number;
      }) => Promise<{ status: "ok" | "error" | "timeout"; error?: string }>;
      getSessionMessages?: (params: {
        sessionKey: string;
        limit?: number;
      }) => Promise<{ messages: unknown[] }>;
      getSession?: (params: {
        sessionKey: string;
        limit?: number;
      }) => Promise<{ messages: unknown[] }>;
      deleteSession?: (params: {
        sessionKey: string;
        deleteTranscript?: boolean;
      }) => Promise<void>;
    };
  };
  registerService(service: {
    id: string;
    start: () => Promise<void>;
    stop: () => Promise<void>;
  }): void;
  registerHook?(
    events: string | string[],
    handler: (...args: any[]) => void | Promise<void>,
    opts?: Record<string, unknown>
  ): void;
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
    statePath: options.statePath,
    identityPath: options.identityPath,
    agentpodDocPath: options.agentpodDocPath
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
            baseUrl: pluginConfig.hubBaseUrl,
            bearerToken: pluginConfig.pluginToken
          })
        )
      : undefined;
    const subagentTracker = createSubagentTracker();
    const registry = createTaskRegistry();
    const inboundRunner = api.runtime?.subagent
      ? buildInboundRunner({
          runtime: api.runtime.subagent as NonNullable<
            NonNullable<OpenClawLikeApi["runtime"]>["subagent"]
          >,
          tracker: subagentTracker,
          registry,
          sessionKey: pluginConfig.runtimeSessionKey
        })
      : undefined;
    const service = createBackgroundService({
      statePath: pluginConfig.statePath,
      identityPath: pluginConfig.identityPath,
      agentpodDocPath: pluginConfig.agentpodDocPath,
      client,
      inboundRunner
    });
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

    api.registerHook?.("subagent_spawned", async (event) => {
      if (
        !event ||
        typeof event !== "object" ||
        typeof (event as { runId?: unknown }).runId !== "string" ||
        typeof (event as { childSessionKey?: unknown }).childSessionKey !== "string"
      ) {
        return;
      }

      subagentTracker.noteSpawned({
        runId: (event as { runId: string }).runId,
        childSessionKey: (event as { childSessionKey: string }).childSessionKey
      });
    }, { plugin: "agentpod" });

    api.registerHook?.("subagent_ended", async (event) => {
      if (
        !event ||
        typeof event !== "object" ||
        typeof (event as { targetSessionKey?: unknown }).targetSessionKey !== "string"
      ) {
        return;
      }

      subagentTracker.noteEnded({
        runId:
          typeof (event as { runId?: unknown }).runId === "string"
            ? (event as { runId: string }).runId
            : undefined,
        targetSessionKey: (event as { targetSessionKey: string }).targetSessionKey,
        reason:
          typeof (event as { reason?: unknown }).reason === "string"
            ? (event as { reason: string }).reason
            : "ended",
        outcome:
          typeof (event as { outcome?: unknown }).outcome === "string"
            ? (event as {
                outcome: "ok" | "error" | "timeout" | "killed" | "reset" | "deleted";
              }).outcome
            : undefined
      });
    }, { plugin: "agentpod" });

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
    identityPath:
      typeof pluginConfig?.identityPath === "string"
        ? pluginConfig.identityPath
        : undefined,
    agentpodDocPath:
      typeof pluginConfig?.agentpodDocPath === "string"
        ? pluginConfig.agentpodDocPath
        : "AGENTPOD.md",
    hubBaseUrl:
      typeof pluginConfig?.hubBaseUrl === "string" ? pluginConfig.hubBaseUrl : undefined,
    pluginToken:
      typeof pluginConfig?.pluginToken === "string" ? pluginConfig.pluginToken : undefined,
    runtimeSessionKey:
      typeof pluginConfig?.runtimeSessionKey === "string"
        ? pluginConfig.runtimeSessionKey
        : "main",
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
  const agentpod = program
    .command("agentpod")
    .description("Manage AgentPod network state");

  agentpod
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

  agentpod
    .command("publish")
    .description("Publish the compiled AgentPod source document")
    .action(async () => {
      process.stdout.write(`${JSON.stringify(await cli.publish(), null, 2)}\n`);
    });

  agentpod
    .command("peers")
    .description("List cached AgentPod peers")
    .action(async () => {
      process.stdout.write(`${JSON.stringify(await cli.peers(), null, 2)}\n`);
    });

  agentpod
    .command("tasks")
    .description("List tracked AgentPod tasks")
    .action(async () => {
      process.stdout.write(`${JSON.stringify(await cli.tasks(), null, 2)}\n`);
    });

  agentpod
    .command("leave")
    .description("Leave the active AgentPod network")
    .action(async () => {
      process.stdout.write(`${JSON.stringify(await cli.leave(), null, 2)}\n`);
    });
}

function buildInboundRunner({
  runtime,
  tracker,
  registry,
  sessionKey
}: {
  runtime: NonNullable<NonNullable<OpenClawLikeApi["runtime"]>["subagent"]>;
  tracker: ReturnType<typeof createSubagentTracker>;
  registry: ReturnType<typeof createTaskRegistry>;
  sessionKey: string;
}) {
  const executor = createRuntimeSubagentExecutor({
    sessionKey,
    runtime,
    tracker
  });
  const taskRunner = createTaskRunner({
    registry,
    spawnSession(input) {
      return executor.execute(input);
    },
    executionGuard: createExecutionGuard({})
  });

  return {
    accept: taskRunner.accept,
    awaitResult(input: {
      task: TaskRequest;
      childSessionKey: string;
      runId?: string;
    }) {
      if (!input.runId) {
        throw new Error(`Inbound task ${input.task.task_id} is missing a runId`);
      }

      return executor.awaitResult({
        taskId: input.task.task_id,
        runId: input.runId,
        childSessionKey: input.childSessionKey
      });
    }
  };
}

async function runSlashFromArgs(
  slash: ReturnType<typeof createSlashCommands>,
  args: string
) {
  const [command = "status", ...rest] = args.trim().split(/\s+/).filter(Boolean);

  if (command === "join") {
    const [profileName = "default", ...joinArgs] = rest;
    const options = parseFlagArgs(joinArgs);

    if (typeof options["join-url"] === "string") {
      return slash.join({
        profileName,
        joinUrl: options["join-url"]
      });
    }

    if (typeof options["base-url"] === "string") {
      return slash.join({
        profileName,
        networkId:
          typeof options["network-id"] === "string" ? options["network-id"] : profileName,
        baseUrl: options["base-url"]
      });
    }

    throw new Error("join requires --join-url or --base-url");
  }

  if (command === "leave") {
    return slash.leave();
  }

  if (command === "publish") {
    return slash.publish();
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

function parseFlagArgs(args: string[]) {
  const options: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token?.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = args[index + 1];
    if (value && !value.startsWith("--")) {
      options[key] = value;
      index += 1;
      continue;
    }

    options[key] = "true";
  }

  return options;
}

export default agentpodPlugin;
