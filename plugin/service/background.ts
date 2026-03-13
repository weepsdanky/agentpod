import type { AgentPodClient, DelegationHandle } from "../client";
import type { ManagedNetworkProfile, PeerProfile, PrivateNetworkProfile } from "../types/agentpod";
import { resolveProfile, type ProfileResolverDependencies, type ResolvedProfile } from "../config";
import { generateLocalPeerIdentity } from "../identity/keys";
import { createStateStore, type AgentPodState } from "../state/store";
import { createPeerCache } from "./peer-cache";
import { createSubstrateSync } from "./substrate-sync";
import type { CapabilityManifest, TaskRequest, TaskResult, TaskUpdate } from "../types/agentpod";

interface BackgroundServiceOptions extends ProfileResolverDependencies {
  statePath: string;
  client?: Pick<AgentPodClient, "publishManifest" | "listPeers" | "delegate" | "subscribeTask">;
}

type StartProfile = ManagedNetworkProfile | PrivateNetworkProfile;

export function createBackgroundService(options: BackgroundServiceOptions) {
  const store = createStateStore(options.statePath);
  const peerCache = createPeerCache<PeerProfile>();
  const substrateSync = createSubstrateSync(peerCache, options.client);
  const identity = generateLocalPeerIdentity();

  let running = false;
  let loaded = false;
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

  return {
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

      return resolvedProfile;
    },

    async stop() {
      running = false;
    },

    async publishManifest(manifest: CapabilityManifest) {
      await ensureLoaded();
      const nextPeers = await substrateSync.publishAndRefresh(manifest);
      state.peers = nextPeers;
      await store.save(state);
      return nextPeers;
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
    }
  };
}
