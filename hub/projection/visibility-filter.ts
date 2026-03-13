export type DiscoveryVisibility = "private" | "network_only" | "public";

export function isPubliclyVisible(visibility: DiscoveryVisibility): boolean {
  return visibility === "public";
}
