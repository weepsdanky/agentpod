import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface AgentPodState {
  activeProfile: string | null;
  peers: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
}

const DEFAULT_STATE: AgentPodState = {
  activeProfile: null,
  peers: [],
  tasks: []
};

export function createStateStore(path: string) {
  return {
    async load(): Promise<AgentPodState> {
      try {
        const content = await readFile(path, "utf8");
        const parsed = JSON.parse(content) as Partial<AgentPodState>;

        return {
          activeProfile: parsed.activeProfile ?? null,
          peers: parsed.peers ?? [],
          tasks: parsed.tasks ?? []
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return structuredClone(DEFAULT_STATE);
        }
        throw error;
      }
    },

    async save(state: AgentPodState): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(state, null, 2), "utf8");
    }
  };
}
