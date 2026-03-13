import type { ArtifactRef, DeliveryArtifactMode } from "../types/agentpod";

export function normalizeArtifactsForDelivery(
  mode: DeliveryArtifactMode,
  artifacts: ArtifactRef[]
): ArtifactRef[] {
  if (mode === "allow_links") {
    return artifacts;
  }

  return artifacts.filter((artifact) => artifact.kind !== "relay");
}
