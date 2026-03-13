import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { TaskRequest } from "../../plugin/types/agentpod";

interface MailboxState {
  mailboxes: Record<string, TaskRequest[]>;
}

const DEFAULT_STATE: MailboxState = {
  mailboxes: {}
};

export function createMailboxStore(path?: string) {
  let loaded = false;
  let state: MailboxState = structuredClone(DEFAULT_STATE);

  async function ensureLoaded() {
    if (loaded) {
      return;
    }

    if (!path) {
      loaded = true;
      return;
    }

    try {
      const content = await readFile(path, "utf8");
      const parsed = JSON.parse(content) as Partial<MailboxState>;
      state = {
        mailboxes: parsed.mailboxes ?? {}
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      state = structuredClone(DEFAULT_STATE);
    }

    loaded = true;
  }

  async function save() {
    if (!path) {
      return;
    }

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 2), "utf8");
  }

  return {
    async enqueue(peerId: string, task: TaskRequest) {
      await ensureLoaded();
      const queue = state.mailboxes[peerId] ?? [];
      queue.push(task);
      state.mailboxes[peerId] = queue;
      await save();
    },

    async claim(peerId: string) {
      await ensureLoaded();
      const queue = state.mailboxes[peerId] ?? [];
      const task = queue.shift() ?? null;

      if (queue.length === 0) {
        delete state.mailboxes[peerId];
      } else {
        state.mailboxes[peerId] = queue;
      }

      await save();
      return task;
    }
  };
}
