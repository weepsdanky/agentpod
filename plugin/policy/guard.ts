import type { ArtifactPolicy, ServicePolicy, ToolUsePolicy } from "../types/agentpod";

export interface OwnerRuntimePolicy {
  tool_use?: ToolUsePolicy;
  artifacts?: ArtifactPolicy;
}

export interface GuardResolutionInput {
  serviceDefaults?: ServicePolicy;
  request?: {
    tool_use?: ToolUsePolicy;
    artifact?: ArtifactPolicy;
  };
}

export function createExecutionGuard(ownerPolicy: OwnerRuntimePolicy) {
  return {
    resolve(input: GuardResolutionInput) {
      return {
        tool_use:
          ownerPolicy.tool_use ??
          input.request?.tool_use ??
          input.serviceDefaults?.tool_use ??
          "ask",
        artifact:
          ownerPolicy.artifacts ??
          input.request?.artifact ??
          input.serviceDefaults?.artifact ??
          "inline_only"
      };
    }
  };
}
