import { createSlashCommands } from "./slash";

export function createGatewayMethods(service: Parameters<typeof createSlashCommands>[0]) {
  const commands = createSlashCommands(service);

  return {
    "agentpod.status": async () => service.snapshot(),
    "agentpod.peers.list": commands.peers,
    "agentpod.tasks.list": commands.tasks,
    "agentpod.network.join": commands.join,
    "agentpod.network.leave": commands.leave
  };
}
