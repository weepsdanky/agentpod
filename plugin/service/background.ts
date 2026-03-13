import type { FileStateStore, StateSnapshot } from "../state/store";

interface BackgroundServiceOptions {
  store: FileStateStore;
}

export interface BackgroundService {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getSnapshot(): StateSnapshot;
  setSnapshot(snapshot: StateSnapshot): Promise<void>;
}

export function createBackgroundService(options: BackgroundServiceOptions): BackgroundService {
  let running = false;
  let snapshot: StateSnapshot = {
    peers: [],
    tasks: []
  };

  return {
    async start() {
      snapshot = await options.store.load();
      running = true;
    },

    async stop() {
      running = false;
    },

    isRunning() {
      return running;
    },

    getSnapshot() {
      return snapshot;
    },

    async setSnapshot(nextSnapshot) {
      snapshot = nextSnapshot;
      await options.store.save(snapshot);
    }
  };
}
