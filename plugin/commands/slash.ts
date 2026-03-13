import type { ManagedNetworkProfile, PrivateNetworkProfile } from "../types/agentpod";

interface JoinArgs {
  profileName: string;
  joinUrl?: string;
  networkId?: string;
  baseUrl?: string;
}

interface CommandService {
  start(profileName: string, profile: ManagedNetworkProfile | PrivateNetworkProfile): Promise<unknown>;
  stop(): Promise<void>;
  snapshot(): {
    peers: Array<Record<string, unknown>>;
    tasks: Array<Record<string, unknown>>;
  };
}

export function createSlashCommands(service: CommandService) {
  return {
    async join(args: JoinArgs) {
      const profile = toJoinProfile(args);
      const result = await service.start(args.profileName, profile);

      return {
        ok: true,
        profileName: args.profileName,
        ...(typeof result === "object" && result !== null ? result : {})
      };
    },

    async leave() {
      await service.stop();
      return { ok: true };
    },

    async peers() {
      return service.snapshot().peers;
    },

    async tasks() {
      return service.snapshot().tasks;
    }
  };
}

function toJoinProfile(args: JoinArgs): ManagedNetworkProfile | PrivateNetworkProfile {
  if (args.joinUrl) {
    return {
      mode: "managed",
      join_url: args.joinUrl
    };
  }

  if (args.networkId && args.baseUrl) {
    return {
      mode: "private",
      network_id: args.networkId,
      base_url: args.baseUrl
    };
  }

  throw new Error("Join requires either joinUrl or networkId + baseUrl");
}
