interface SpawnedEvent {
  runId: string;
  childSessionKey: string;
  agentId?: string;
  label?: string;
  mode?: string;
  threadRequested?: boolean;
}

interface EndedEvent {
  runId?: string;
  targetSessionKey: string;
  outcome?: "ok" | "error" | "timeout" | "killed" | "reset" | "deleted";
  reason: string;
  targetKind?: string;
}

interface SpawnedRecord {
  runId: string;
  childSessionKey: string;
}

interface EndedRecord extends EndedEvent {
  runId: string;
}

export function createSubagentTracker() {
  const spawned = new Map<string, SpawnedRecord>();
  const ended = new Map<string, EndedRecord>();
  const waiters = new Map<
    string,
    Array<{
      resolve(record: SpawnedRecord): void;
      reject(error: Error): void;
      timeout: ReturnType<typeof setTimeout>;
    }>
  >();

  return {
    noteSpawned(event: SpawnedEvent) {
      const record: SpawnedRecord = {
        runId: event.runId,
        childSessionKey: event.childSessionKey
      };
      spawned.set(event.runId, record);
      const listeners = waiters.get(event.runId) ?? [];
      waiters.delete(event.runId);
      for (const listener of listeners) {
        clearTimeout(listener.timeout);
        listener.resolve(record);
      }
      return record;
    },

    noteEnded(event: EndedEvent) {
      if (!event.runId) {
        return undefined;
      }

      const record: EndedRecord = {
        runId: event.runId,
        targetSessionKey: event.targetSessionKey,
        outcome: event.outcome,
        reason: event.reason
      };
      ended.set(event.runId, record);
      return record;
    },

    waitForSpawned(runId: string, timeoutMs = 1_000) {
      const existing = spawned.get(runId);
      if (existing) {
        return Promise.resolve(existing);
      }

      return new Promise<SpawnedRecord>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const listeners = (waiters.get(runId) ?? []).filter((listener) => listener.reject !== reject);
          if (listeners.length === 0) {
            waiters.delete(runId);
          } else {
            waiters.set(runId, listeners);
          }
          reject(new Error(`Timed out waiting for subagent run ${runId}`));
        }, timeoutMs);

        const listeners = waiters.get(runId) ?? [];
        listeners.push({ resolve, reject, timeout });
        waiters.set(runId, listeners);
      });
    },

    getEnded(runId: string) {
      return ended.get(runId);
    }
  };
}
