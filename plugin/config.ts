import type { ManagedNetworkProfile, PrivateNetworkProfile } from "./types/agentpod";

export interface JoinManifest {
  network_id: string;
  directory_url: string;
  substrate_url: string;
}

export interface ProfileResolverDependencies {
  fetchJoinManifest?: (joinUrl: string) => Promise<JoinManifest>;
}

export interface ResolvedManagedProfile extends ManagedNetworkProfile {
  network_id: string;
  directory_url: string;
  substrate_url: string;
}

export interface ResolvedPrivateProfile extends PrivateNetworkProfile {
  directory_url: string;
  substrate_url: string;
}

export type ResolvedProfile = ResolvedManagedProfile | ResolvedPrivateProfile;

export async function resolveProfile(
  profile: ManagedNetworkProfile | PrivateNetworkProfile,
  dependencies: ProfileResolverDependencies = {}
): Promise<ResolvedProfile> {
  if (profile.mode === "managed") {
    if (!dependencies.fetchJoinManifest) {
      throw new Error("Managed profiles require join manifest resolution");
    }

    const manifest = await dependencies.fetchJoinManifest(profile.join_url);

    return {
      ...profile,
      network_id: manifest.network_id,
      directory_url: manifest.directory_url,
      substrate_url: manifest.substrate_url
    };
  }

  const baseUrl = profile.base_url.replace(/\/+$/, "");
  const substrateBase = baseUrl.replace(/^http/i, "ws");

  return {
    ...profile,
    directory_url: `${baseUrl}/directory`,
    substrate_url: `${substrateBase}/substrate`
  };
}
