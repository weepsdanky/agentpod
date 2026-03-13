import type {
  ManagedNetworkProfile,
  PrivateNetworkProfile,
  PublicCardVisibility
} from "./types/agentpod";

export interface AgentPodConfigInput {
  activeProfile?: string;
  profiles: Record<string, ManagedNetworkProfile | PrivateNetworkProfile>;
}

export interface ResolvedManagedProfile extends ManagedNetworkProfile {
  name: string;
}

export interface ResolvedPrivateProfile extends PrivateNetworkProfile {
  name: string;
  directory_url: string;
  substrate_url: string;
  public_card_visibility?: PublicCardVisibility;
}

export type ResolvedProfile = ResolvedManagedProfile | ResolvedPrivateProfile;

export function resolveActiveProfile(config: AgentPodConfigInput): ResolvedProfile {
  if (!config.activeProfile) {
    throw new Error("Active profile is required");
  }

  const profile = config.profiles[config.activeProfile];
  if (!profile) {
    throw new Error(`Active profile not found: ${config.activeProfile}`);
  }

  if (profile.mode === "managed") {
    return {
      name: config.activeProfile,
      mode: "managed",
      join_url: profile.join_url
    };
  }

  const baseUrl = profile.base_url.replace(/\/+$/, "");

  return {
    ...profile,
    name: config.activeProfile,
    base_url: baseUrl,
    directory_url: `${baseUrl}/directory`,
    substrate_url: `${baseUrl}/substrate`
  };
}
