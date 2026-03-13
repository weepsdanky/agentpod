import type { TaskRegistry } from "../tasks/registry";

export function createTasksTool(registry: Pick<TaskRegistry, "list">) {
  return async function agentpodTasks() {
    return registry.list();
  };
}
