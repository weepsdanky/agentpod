import { createServer, type IncomingMessage } from "node:http";
import { pathToFileURL } from "node:url";

import type { HubConfig } from "./config/schema";
import { createHubRouter } from "./operator-api/routes";

export const workspaceMarker = "agentpod-hub";

interface HubServerOptions extends HubConfig {
  bindHost: string;
  port: number;
  discoveryRecords: Parameters<typeof createHubRouter>[0]["discoveryRecords"];
  peerProfiles?: Parameters<typeof createHubRouter>[0]["peerProfiles"];
  deliverTask?: Parameters<typeof createHubRouter>[0]["deliverTask"];
  mailboxStatePath?: Parameters<typeof createHubRouter>[0]["mailboxStatePath"];
}

export interface RunningHubServer {
  readonly baseUrl: string;
  close(): Promise<void>;
}

export interface ParsedHubCliArgs extends HubServerOptions {
  help: boolean;
}

export async function startHubServer(options: HubServerOptions): Promise<RunningHubServer> {
  const router = createHubRouter(options);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const taskEventsMatch = request.method === "GET"
        ? url.pathname.match(/^\/v1\/tasks\/([^/]+)\/events$/)
        : null;

      if (taskEventsMatch) {
        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream; charset=utf-8");
        response.setHeader("cache-control", "no-cache");
        response.setHeader("connection", "keep-alive");
        response.flushHeaders?.();

        const unsubscribe = router.subscribeTask(taskEventsMatch[1], (event) => {
          response.write(`data: ${JSON.stringify(event)}\n\n`);
          if (event.kind === "result") {
            response.end();
          }
        });

        request.on("close", () => {
          unsubscribe();
        });
        return;
      }

      const body = await readJsonBody(request);
      const result = await router.handle({
        method: normalizeMethod(request.method),
        path: url.pathname,
        headers: toHeaderRecord(request),
        body
      });

      response.statusCode = result.status;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify(result.body));
    } catch (error) {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({
        error: "internal_error",
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.bindHost, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Hub server did not bind to a TCP address");
  }

  return {
    baseUrl: `http://${options.bindHost}:${address.port}`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  if (request.method === "GET") {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function normalizeMethod(method: string | undefined): "GET" | "POST" {
  return method === "POST" ? "POST" : "GET";
}

function toHeaderRecord(request: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") {
      headers[name] = value;
      continue;
    }

    if (Array.isArray(value)) {
      headers[name] = value.join(", ");
    }
  }

  return headers;
}

export type { HubServerOptions };

export function parseHubCliArgs(argv: string[]): ParsedHubCliArgs {
  const args = new Map<string, string>();
  const normalizedArgv = argv.filter((arg) => arg !== "--");

  for (let index = 0; index < normalizedArgv.length; index += 2) {
    const flag = normalizedArgv[index];
    if (!flag?.startsWith("--")) {
      continue;
    }

    if (flag === "--help") {
      return {
        help: true,
        ...defaultHubCliArgs()
      };
    }

    args.set(flag, normalizedArgv[index + 1] ?? "");
  }

  const bind = args.get("--bind") ?? "127.0.0.1:4590";
  const [bindHost, rawPort] = bind.split(":");
  const port = Number.parseInt(rawPort ?? "4590", 10);
  const mode = (args.get("--mode") ?? "private") as HubConfig["mode"];
  const networkId = args.get("--network-id") ?? "agentpod-local";
  const baseUrl = args.get("--base-url") ?? `http://${bindHost}:${port}`;
  const substrateBase = baseUrl.replace(/^http/i, "ws");

  return {
    help: false,
    bindHost,
    port,
    mode,
    networkId,
    directoryUrl: `${baseUrl.replace(/\/+$/, "")}/directory`,
    substrateUrl: `${substrateBase.replace(/\/+$/, "")}/substrate`,
    operatorKeyId: args.get("--operator-key-id") ?? "agentpod-local-dev",
    issuer: args.get("--issuer") ?? `${networkId}-operator`,
    manifestSignature: args.get("--manifest-signature") ?? "local-dev-signature",
    operatorToken: args.get("--operator-token") ?? "agentpod-local-operator-token",
    runtimeToken: args.get("--runtime-token") ?? undefined,
    mailboxStatePath:
      args.get("--mailbox-state-path") ?? ".agentpod-hub/mailbox-state.json",
    discoveryRecords: [],
    peerProfiles: []
  };
}

function defaultHubCliArgs(): HubServerOptions {
  return {
    bindHost: "127.0.0.1",
    port: 4590,
    mode: "private",
    networkId: "agentpod-local",
    directoryUrl: "http://127.0.0.1:4590/directory",
    substrateUrl: "ws://127.0.0.1:4590/substrate",
    operatorKeyId: "agentpod-local-dev",
    issuer: "agentpod-local-operator",
    manifestSignature: "local-dev-signature",
    operatorToken: "agentpod-local-operator-token",
    runtimeToken: undefined,
    mailboxStatePath: ".agentpod-hub/mailbox-state.json",
    discoveryRecords: [],
    peerProfiles: []
  };
}

function printHubHelp() {
  process.stdout.write(`AgentPod hub\n\n`);
  process.stdout.write(`Usage: tsx hub/index.ts [options]\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --bind <host:port>           Bind address (default: 127.0.0.1:4590)\n`);
  process.stdout.write(`  --mode <managed|private>     Hub mode (default: private)\n`);
  process.stdout.write(`  --network-id <id>            Network id (default: agentpod-local)\n`);
  process.stdout.write(`  --base-url <url>             Public base URL used in returned endpoints\n`);
  process.stdout.write(`  --operator-token <token>     Operator token for revoke endpoint\n`);
  process.stdout.write(`  --runtime-token <token>      Runtime token for mailbox/event endpoints\n`);
  process.stdout.write(`  --mailbox-state-path <path>  JSON file for persisted mailbox state\n`);
  process.stdout.write(`  --help                       Show this help\n`);
}

async function main() {
  const parsed = parseHubCliArgs(process.argv.slice(2));
  if (parsed.help) {
    printHubHelp();
    return;
  }

  const server = await startHubServer(parsed);
  process.stdout.write(`AgentPod hub listening on ${server.baseUrl}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
