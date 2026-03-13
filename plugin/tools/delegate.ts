import type { AgentPodClient, DelegationHandle } from "../client";
import type { TaskRequest } from "../types/agentpod";
import type { TaskRegistry } from "../tasks/registry";

export function createDelegateTool({
  client,
  registry
}: {
  client: Pick<AgentPodClient, "delegate">;
  registry: Pick<TaskRegistry, "recordOutbound">;
}) {
  return async function agentpodDelegate(task: TaskRequest): Promise<DelegationHandle> {
    const handle = await client.delegate(task);
    registry.recordOutbound(handle);
    return handle;
  };
}
