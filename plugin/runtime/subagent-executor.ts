import type { ArtifactRef, TaskResult } from "../types/agentpod";

interface RuntimeSubagent {
  run(input: {
    sessionKey: string;
    message: string;
    idempotencyKey?: string;
  }): Promise<{ runId: string }>;
  waitForRun?(input: {
    runId: string;
    timeoutMs?: number;
  }): Promise<{ status: "ok" | "error" | "timeout"; error?: string }>;
  getSessionMessages?(input: {
    sessionKey: string;
    limit?: number;
  }): Promise<{ messages: unknown[] }>;
  getSession?(input: {
    sessionKey: string;
    limit?: number;
  }): Promise<{ messages: unknown[] }>;
}

interface SubagentTracker {
  waitForSpawned(
    runId: string,
    timeoutMs?: number
  ): Promise<{ runId: string; childSessionKey: string }>;
}

export function createRuntimeSubagentExecutor({
  sessionKey,
  runtime,
  tracker,
  spawnTimeoutMs = 1_000,
  completionTimeoutMs = 60_000,
  messageLimit = 20
}: {
  sessionKey: string;
  runtime: RuntimeSubagent;
  tracker: SubagentTracker;
  spawnTimeoutMs?: number;
  completionTimeoutMs?: number;
  messageLimit?: number;
}) {
  return {
    async execute(input: {
      taskId: string;
      service: string;
      payload: Record<string, unknown>;
      attachments: Array<Record<string, unknown>>;
    }) {
      const { runId } = await runtime.run({
        sessionKey,
        message: renderInboundTaskMessage(input),
        idempotencyKey: `agentpod:${input.taskId}`
      });

      try {
        const spawned = await tracker.waitForSpawned(runId, spawnTimeoutMs);
        return {
          runId,
          childSessionKey: spawned.childSessionKey
        };
      } catch {
        return {
          runId,
          childSessionKey: sessionKey
        };
      }
    },

    async awaitResult(input: {
      taskId: string;
      runId: string;
      childSessionKey: string;
    }): Promise<TaskResult> {
      if (!runtime.waitForRun) {
        throw new Error("Runtime subagent waitForRun is required");
      }

      const completion = await runtime.waitForRun({
        runId: input.runId,
        timeoutMs: completionTimeoutMs
      });

      if (completion.status !== "ok") {
        return {
          version: "0.1",
          task_id: input.taskId,
          status: "failed",
          output: {
            text:
              completion.error ??
              `Subagent run ${input.runId} ended with status ${completion.status}.`
          },
          artifacts: [],
          execution_summary: {
            used_tools: [],
            used_network: false
          }
        };
      }

      const messages = await readSessionMessages(runtime, input.childSessionKey, messageLimit);
      const text = synthesizeResultText(messages);
      return {
        version: "0.1",
        task_id: input.taskId,
        status: "completed",
        output: {
          text
        },
        artifacts: synthesizeArtifacts(messages, text),
        execution_summary: {
          used_tools: [],
          used_network: false
        }
      };
    }
  };
}

function renderInboundTaskMessage(input: {
  taskId: string;
  service: string;
  payload: Record<string, unknown>;
  attachments: Array<Record<string, unknown>>;
}) {
  const payload =
    Object.keys(input.payload).length === 0
      ? "(empty)"
      : JSON.stringify(input.payload, null, 2);

  return [
    `AgentPod inbound task ${input.taskId}`,
    `service: ${input.service}`,
    "",
    "payload:",
    payload,
    "",
    `attachments: ${input.attachments.length}`
  ].join("\n");
}

async function readSessionMessages(
  runtime: RuntimeSubagent,
  childSessionKey: string,
  limit: number
) {
  if (runtime.getSessionMessages) {
    const response = await runtime.getSessionMessages({
      sessionKey: childSessionKey,
      limit
    });
    return response.messages;
  }

  if (runtime.getSession) {
    const response = await runtime.getSession({
      sessionKey: childSessionKey,
      limit
    });
    return response.messages;
  }

  throw new Error("Runtime subagent getSessionMessages is required");
}

function synthesizeResultText(messages: unknown[]) {
  for (const message of [...messages].reverse()) {
    const extracted = extractText(message);
    if (extracted) {
      return extracted;
    }
  }

  return "Subagent completed without a textual response.";
}

function synthesizeArtifacts(messages: unknown[], text: string): ArtifactRef[] {
  const explicit = messages.flatMap((message) => extractArtifacts(message));
  if (explicit.length > 0) {
    return explicit;
  }

  const markdownMatch = text.match(/(?:named?|for)\s+`?([\w.-]+\.md)`?[\s\S]*?```markdown\n([\s\S]*?)```/i);
  if (markdownMatch) {
    return [
      {
        kind: "inline",
        name: markdownMatch[1],
        mime_type: "text/markdown",
        content: markdownMatch[2].trim()
      }
    ];
  }

  const genericMarkdownBlock = text.match(/```markdown\n([\s\S]*?)```/i);
  if (genericMarkdownBlock) {
    return [
      {
        kind: "inline",
        name: "artifact.md",
        mime_type: "text/markdown",
        content: genericMarkdownBlock[1].trim()
      }
    ];
  }

  const genericTextBlock = text.match(/```text\n([\s\S]*?)```/i);
  if (genericTextBlock) {
    return [
      {
        kind: "inline",
        name: "artifact.txt",
        mime_type: "text/plain",
        content: genericTextBlock[1].trim()
      }
    ];
  }

  return [];
}

function extractArtifacts(message: unknown): ArtifactRef[] {
  if (!message || typeof message !== "object") {
    return [];
  }

  const candidate = message as { artifacts?: unknown; content?: unknown };
  if (Array.isArray(candidate.artifacts)) {
    return candidate.artifacts
      .map((artifact) => normalizeArtifact(artifact))
      .filter((artifact): artifact is ArtifactRef => Boolean(artifact));
  }

  if (Array.isArray(candidate.content)) {
    return candidate.content
      .map((part) => normalizeArtifact(part))
      .filter((artifact): artifact is ArtifactRef => Boolean(artifact));
  }

  return [];
}

function normalizeArtifact(input: unknown): ArtifactRef | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const candidate = input as {
    type?: unknown;
    kind?: unknown;
    name?: unknown;
    filename?: unknown;
    mime_type?: unknown;
    mimeType?: unknown;
    url?: unknown;
    content?: unknown;
    text?: unknown;
  };

  const name =
    typeof candidate.name === "string"
      ? candidate.name
      : typeof candidate.filename === "string"
        ? candidate.filename
        : undefined;
  const mimeType =
    typeof candidate.mime_type === "string"
      ? candidate.mime_type
      : typeof candidate.mimeType === "string"
        ? candidate.mimeType
        : undefined;
  const url = typeof candidate.url === "string" ? candidate.url : undefined;
  const content =
    typeof candidate.content === "string"
      ? candidate.content
      : typeof candidate.text === "string"
        ? candidate.text
        : undefined;

  if (!name && !url && !content) {
    return undefined;
  }

  return {
    kind: typeof candidate.kind === "string" ? (candidate.kind as "inline" | "relay") : url ? "relay" : "inline",
    ...(name ? { name } : {}),
    ...(mimeType ? { mime_type: mimeType } : {}),
    ...(url ? { url } : {}),
    ...(content ? { content } : {})
  };
}

function extractText(message: unknown): string | undefined {
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  if (!message || typeof message !== "object") {
    return undefined;
  }

  const candidate = message as {
    text?: unknown;
    content?: unknown;
    message?: unknown;
  };

  if (typeof candidate.text === "string" && candidate.text.trim()) {
    return candidate.text.trim();
  }

  if (typeof candidate.message === "string" && candidate.message.trim()) {
    return candidate.message.trim();
  }

  if (Array.isArray(candidate.content)) {
    const textParts = candidate.content
      .map((part) => {
        if (!part || typeof part !== "object") {
          return undefined;
        }
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" && text.trim() ? text.trim() : undefined;
      })
      .filter((part): part is string => Boolean(part));

    if (textParts.length > 0) {
      return textParts.join("\n");
    }
  }

  if (typeof candidate.content === "string" && candidate.content.trim()) {
    return candidate.content.trim();
  }

  return undefined;
}
