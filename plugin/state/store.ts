import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { PeerProfile } from "../types/agentpod";

export interface TaskSnapshot {
  task_id: string;
  status: string;
}

export interface StateSnapshot {
  peers: PeerProfile[];
  tasks: TaskSnapshot[];
}

export interface FileStateStore {
  load(): Promise<StateSnapshot>;
  save(snapshot: StateSnapshot): Promise<void>;
}

const EMPTY_STATE: StateSnapshot = {
  peers: [],
  tasks: []
};

export function createFileStateStore(path: string): FileStateStore {
  return {
    async load() {
      try {
        const raw = await readFile(path, "utf8");
        return {
          ...EMPTY_STATE,
          ...(JSON.parse(raw) as Partial<StateSnapshot>)
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return EMPTY_STATE;
        }
        throw error;
      }
    },

    async save(snapshot) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(snapshot, null, 2));
    }
  };
}
