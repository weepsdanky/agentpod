import type { ManagedNetworkProfile, PrivateNetworkProfile } from "../types/agentpod";
import { resolveProfile, type ProfileResolverDependencies, type ResolvedProfile } from "../config";
import { generateLocalPeerIdentity } from "../identity/keys";
import { createStateStore, type AgentPodState } from "../state/store";
import { createPeerCache } from "./peer-cache";
import { createSubstrateSync } from "./substrate-sync";

interface BackgroundServiceOptions extends ProfileResolverDependencies {
  statePath: string;
}

type StartProfile = ManagedNetworkProfile | PrivateNetworkProfile;

export function createBackgroundService(options: BackgroundServiceOptions) {
  const store = createStateStore(options.statePath);
  const peerCache = createPeerCache();
  const substrateSync = createSubstrateSync(peerCache);
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

    syncPeers(peers: Array<Record<string, unknown>>) {
      const nextPeers = substrateSync.refresh(peers);
      state.peers = nextPeers;
      return nextPeers;
    }
  };
}
