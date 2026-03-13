import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import type { AgentPodClient, DelegationHandle } from "../client";
import type { ManagedNetworkProfile, PeerProfile, PrivateNetworkProfile } from "../types/agentpod";
import { resolveProfile, type ProfileResolverDependencies, type ResolvedProfile } from "../config";
import { signCapabilityManifest } from "../identity/keys";
import { loadOrCreateLocalPeerIdentity } from "../identity/store";
import { compileAgentPodSource } from "../source-doc/compiler";
import { createStateStore, type AgentPodState } from "../state/store";
import { createPeerCache } from "./peer-cache";
import { createSubstrateSync } from "./substrate-sync";
import type { CapabilityManifest, TaskRequest, TaskResult, TaskUpdate } from "../types/agentpod";

interface BackgroundServiceOptions extends ProfileResolverDependencies {
  statePath: string;
  identityPath?: string;
  agentpodDocPath?: string;
  autoPoll?: boolean;
  pollIntervalMs?: number;
  client?: Pick<
    AgentPodClient,
    | "publishManifest"
    | "listPeers"
    | "delegate"
    | "subscribeTask"
    | "claimInboundTask"
    | "publishTaskEvent"
  >;
  inboundRunner?: {
    accept(task: TaskRequest): Promise<
      | {
          accepted: true;
          childSessionKey: string;
          runId?: string;
        }
      | {
          accepted: false;
          reason: string;
        }
    >;
    awaitResult?(input: {
      task: TaskRequest;
      childSessionKey: string;
      runId?: string;
    }): Promise<TaskResult>;
  };
}

type StartProfile = ManagedNetworkProfile | PrivateNetworkProfile;

export function createBackgroundService(options: BackgroundServiceOptions) {
  const store = createStateStore(options.statePath);
  const peerCache = createPeerCache<PeerProfile>();
  const substrateSync = createSubstrateSync(peerCache, options.client);
  const identity = loadOrCreateLocalPeerIdentity(
    options.identityPath ?? join(dirname(options.statePath), "agentpod-identity.json")
  );
  const agentpodDocPath = resolveAgentPodDocPath(options.agentpodDocPath, options.statePath);

  let running = false;
  let loaded = false;
  let mailboxLoop: Promise<void> | null = null;
  let state: AgentPodState = {
    activeProfile: null,
    peers: [],
    tasks: []
  };
  let resolvedProfile: ResolvedProfile | null = null;

  async function ensureLoaded(): Promise<void> {
    if (!loaded) {
      state = await store.load();
      peerCache.replace(state.peers);
      loaded = true;
    }
  }

  async function processMailboxOnce() {
    if (!options.client?.claimInboundTask || !options.client?.publishTaskEvent || !options.inboundRunner) {
      return false;
    }

    const task = await options.client.claimInboundTask(identity);
    if (!task) {
      return false;
    }

    await service.executeInboundTask(task, async (event) => {
      await options.client?.publishTaskEvent?.(task.task_id, event.data, identity);
    });

    return true;
  }

  async function ensureMailboxLoop() {
    if (mailboxLoop || !running) {
      return;
    }

    mailboxLoop = (async () => {
      let consecutiveFailures = 0;
      try {
        while (running) {
          let processed = false;
          try {
            processed = await processMailboxOnce();
            consecutiveFailures = 0;
          } catch (error) {
            consecutiveFailures += 1;
            const delayMs = Math.min(
              (options.pollIntervalMs ?? 1_000) * 2 ** Math.min(consecutiveFailures - 1, 5),
              30_000
            );
            console.warn(
              "[agentpod] mailbox polling failed",
              error instanceof Error ? error.message : String(error),
              `(retry in ${delayMs}ms)`
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
          if (processed) {
            continue;
          }

          await new Promise((resolve) => setTimeout(resolve, options.pollIntervalMs ?? 1_000));
        }
      } finally {
        mailboxLoop = null;
      }
    })();
  }
  const service = {
    async load() {
      await ensureLoaded();
      return state;
    },

    async start(profileName: string, profile: StartProfile) {
      await ensureLoaded();

      if (state.activeProfile && state.activeProfile !== profileName) {
        throw new Error("Only one active profile is allowed");
      }

      resolvedProfile = await resolveProfile(profile, {
        ...options,
        fetchJoinManifest:
          options.fetchJoinManifest ??
          (async (joinUrl) => ({
            network_id: profileName,
            directory_url: `${joinUrl.replace(/\/+$/, "")}/directory`,
            substrate_url: joinUrl.replace(/^http/i, "ws").replace(/\/+$/, "/substrate")
          }))
      });
      state.activeProfile = profileName;
      await store.save({
        ...state,
        peers: peerCache.list()
      });
      running = true;
      if (options.autoPoll !== false) {
        await ensureMailboxLoop();
      }

      return resolvedProfile;
    },

    async stop() {
      running = false;
      await mailboxLoop;
    },

    async publishManifest(manifest: CapabilityManifest) {
      await ensureLoaded();
      const nextPeers = await substrateSync.publishAndRefresh(manifest);
      state.peers = nextPeers;
      await store.save(state);
      return nextPeers;
    },

    async publishFromSource() {
      const source = await readFile(agentpodDocPath, "utf8");
      const issuedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const compiledManifest = compileAgentPodSource(source, {
        peerId: identity.peer_id,
        issuedAt,
        expiresAt,
        signature: ""
      });
      const manifest = {
        ...compiledManifest,
        signature: signCapabilityManifest(identity, compiledManifest)
      };
      const peers = await this.publishManifest(manifest);

      return {
        ok: true as const,
        peer_id: manifest.peer_id,
        service_count: manifest.services.length,
        peer_count: peers.length
      };
    },

    async delegateTask(task: TaskRequest): Promise<DelegationHandle> {
      await ensureLoaded();

      if (!options.client) {
        throw new Error("Background service requires client access for delegation");
      }

      const handle = await options.client.delegate(task);
      state.tasks = [
        ...state.tasks,
        {
          task_id: handle.task_id,
          status: handle.status
        }
      ];
      await store.save(state);
      return handle;
    },

    async acceptInboundTask(task: TaskRequest) {
      await ensureLoaded();

      if (!options.inboundRunner) {
        throw new Error("Background service requires an inbound runner");
      }

      const accepted = await options.inboundRunner.accept(task);
      state.tasks = [
        ...state.tasks,
        accepted.accepted
          ? {
              task_id: task.task_id,
              status: "running",
              direction: "inbound",
              childSessionKey: accepted.childSessionKey,
              ...(accepted.runId ? { runId: accepted.runId } : {})
            }
          : {
              task_id: task.task_id,
              status: "rejected",
              direction: "inbound",
              reason: accepted.reason
            }
      ];
      await store.save(state);

      return accepted;
    },

    async executeInboundTask(
      task: TaskRequest,
      publish: (
        event: { kind: "update" | "result"; data: TaskUpdate | TaskResult }
      ) => Promise<void> | void
    ) {
      const accepted = await this.acceptInboundTask(task);
      if (!accepted.accepted) {
        return accepted;
      }

      await publish({
        kind: "update",
        data: {
          version: "0.1",
          task_id: task.task_id,
          state: "running",
          message: "Spawned local subagent session",
          progress: 0.1,
          timestamp: new Date().toISOString()
        }
      });

      if (!options.inboundRunner?.awaitResult) {
        return accepted;
      }

      const result = await options.inboundRunner.awaitResult({
        task,
        childSessionKey: accepted.childSessionKey,
        runId: accepted.runId
      });
      state.tasks = state.tasks.map((entry) =>
        entry.task_id === task.task_id
          ? {
              ...entry,
              status: result.status
            }
          : entry
      );
      await store.save(state);

      await publish({
        kind: "result",
        data: result
      });

      return accepted;
    },

    async subscribeTask(
      taskId: string,
      onEvent: (event: TaskUpdate | TaskResult) => void
    ) {
      if (!options.client) {
        throw new Error("Background service requires client access for subscriptions");
      }

      return options.client.subscribeTask(taskId, onEvent);
    },

    isRunning() {
      return running;
    },

    snapshot() {
      return {
        ...state,
        peers: peerCache.list(),
        resolvedProfile,
        identity
      };
    },

    syncPeers(peers: PeerProfile[]) {
      const nextPeers = substrateSync.refresh(peers);
      state.peers = nextPeers;
      return nextPeers;
    },

    async processMailboxOnce() {
      return processMailboxOnce();
    }
  };

  return service;
}

function resolveAgentPodDocPath(agentpodDocPath: string | undefined, statePath: string) {
  const configuredPath = agentpodDocPath ?? "AGENTPOD.md";
  if (isAbsolute(configuredPath)) {
    return configuredPath;
  }

  return resolve(dirname(statePath), configuredPath);
}
