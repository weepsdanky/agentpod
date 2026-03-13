import { createSlashCommands } from "./slash";

export function createCliCommands(service: Parameters<typeof createSlashCommands>[0]) {
  const slash = createSlashCommands(service);

  return {
    join: slash.join,
    leave: slash.leave,
    peers: slash.peers,
    tasks: slash.tasks
  };
}
