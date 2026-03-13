export interface TaskHandle {
  task_id: string;
  status: string;
  direction: "outbound" | "inbound";
  childSessionKey?: string;
}

export interface TaskRegistry {
  recordOutbound(handle: { task_id: string; status: string }): TaskHandle;
  acceptInbound(taskId: string): boolean;
  attachInboundSession(taskId: string, childSessionKey: string): TaskHandle;
  list(): TaskHandle[];
}

export function createTaskRegistry(): TaskRegistry {
  const tasks = new Map<string, TaskHandle>();
  const inboundSeen = new Set<string>();

  return {
    recordOutbound(handle) {
      const nextHandle: TaskHandle = {
        task_id: handle.task_id,
        status: handle.status,
        direction: "outbound"
      };
      tasks.set(handle.task_id, nextHandle);
      return nextHandle;
    },

    acceptInbound(taskId) {
      if (inboundSeen.has(taskId)) {
        return false;
      }

      inboundSeen.add(taskId);
      tasks.set(taskId, {
        task_id: taskId,
        status: "accepted",
        direction: "inbound"
      });
      return true;
    },

    attachInboundSession(taskId, childSessionKey) {
      const existing = tasks.get(taskId);
      const nextHandle: TaskHandle = {
        task_id: taskId,
        status: "running",
        direction: existing?.direction ?? "inbound",
        childSessionKey
      };
      tasks.set(taskId, nextHandle);
      return nextHandle;
    },

    list() {
      return [...tasks.values()];
    }
  };
}
