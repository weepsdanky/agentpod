import type { TaskRequest } from "../types/agentpod";
import type { TaskRegistry } from "./registry";

interface SpawnSessionResult {
  childSessionKey: string;
}

interface ExecutionGuard {
  resolve(input: {
    request?: {
      artifact?: "inline_only" | "allow_links";
    };
  }): {
    artifact: "inline_only" | "allow_links";
    tool_use: string;
  };
}

export function createTaskRunner({
  registry,
  spawnSession,
  executionGuard
}: {
  registry: Pick<TaskRegistry, "acceptInbound" | "attachInboundSession">;
  spawnSession(input: {
    taskId: string;
    service: string;
    payload: Record<string, unknown>;
    attachments: Array<Record<string, unknown>>;
  }): Promise<SpawnSessionResult>;
  executionGuard: ExecutionGuard;
}) {
  return {
    async accept(task: TaskRequest) {
      if (!registry.acceptInbound(task.task_id)) {
        return {
          accepted: false as const,
          reason: "duplicate_task" as const
        };
      }

      executionGuard.resolve({
        request: {
          artifact: task.delivery.artifacts
        }
      });

      const spawned = await spawnSession({
        taskId: task.task_id,
        service: task.service,
        payload: task.input.payload,
        attachments: task.input.attachments
      });

      registry.attachInboundSession(task.task_id, spawned.childSessionKey);

      return {
        accepted: true as const,
        childSessionKey: spawned.childSessionKey
      };
    }
  };
}
