import { describe, expect, it } from "vitest";

import { createHubRouter } from "../operator-api/routes";

describe("AgentPod hub router", () => {
  it("returns signed managed join manifest metadata", async () => {
    const router = createHubRouter({
      mode: "managed",
      networkId: "agentpod-public",
      directoryUrl: "https://agentpod.ai/directory",
      substrateUrl: "wss://agentpod.ai/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: []
    });

    const response = await router.handle({
      method: "GET",
      path: "/v1/networks/agentpod-public/join-manifest"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      network_id: "agentpod-public",
      directory_url: "https://agentpod.ai/directory",
      substrate_url: "wss://agentpod.ai/substrate",
      key_id: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      signature: "manifest-signature"
    });
  });

  it("routes token exchange and renew through the join layer", async () => {
    const router = createHubRouter({
      mode: "managed",
      networkId: "agentpod-public",
      directoryUrl: "https://agentpod.ai/directory",
      substrateUrl: "wss://agentpod.ai/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: []
    });

    const exchange = await router.handle({
      method: "POST",
      path: "/v1/join/exchange",
      body: {
        network_id: "agentpod-public",
        peer_id: "peer_123",
        public_key: "base64...",
        key_fingerprint: "sha256:abcd...",
        proof: {
          signed_at: "2026-03-12T10:01:00Z",
          signature: "base64..."
        }
      }
    });

    expect(exchange.status).toBe(200);
    expect(exchange.body).toMatchObject({
      token_type: "bearer",
      access_token: expect.stringContaining("agentpod_join_tok_")
    });

    const renew = await router.handle({
      method: "POST",
      path: "/v1/tokens/renew",
      headers: {
        authorization: `Bearer ${exchange.body.access_token as string}`
      },
      body: {
        peer_id: "peer_123",
        key_fingerprint: "sha256:abcd..."
      }
    });

    expect(renew.status).toBe(200);
    expect(renew.body).toMatchObject({
      token_type: "bearer",
      access_token: expect.stringContaining("agentpod_join_tok_")
    });
    expect(renew.body.access_token).not.toBe(exchange.body.access_token);
  });

  it("projects sanitized public cards from discovery state", async () => {
    const router = createHubRouter({
      mode: "managed",
      networkId: "agentpod-public",
      directoryUrl: "https://agentpod.ai/directory",
      substrateUrl: "wss://agentpod.ai/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: [
        {
          peer_id: "peer_123",
          network_id: "agentpod-public",
          display_name: "Design Peer",
          summary: "Helps with product thinking and specs.",
          services: [
            {
              id: "product_brainstorm",
              summary: "Brainstorm product ideas"
            }
          ],
          risk_flags: ["uses_network"],
          visibility: "public",
          operator_verified: true,
          last_seen_at: "2026-03-12T10:54:00Z",
          updated_at: "2026-03-12T10:40:00Z"
        }
      ]
    });

    const response = await router.handle({
      method: "GET",
      path: "/v1/public-cards"
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      cards: [
        {
          version: "0.1",
          peer_id: "peer_123",
          network_id: "agentpod-public",
          display_name: "Design Peer",
          summary: "Helps with product thinking and specs.",
          services: [
            {
              id: "product_brainstorm",
              summary: "Brainstorm product ideas"
            }
          ],
          risk_flags: ["uses_network"],
          verified: true,
          last_seen_at: "2026-03-12T10:54:00Z",
          updated_at: "2026-03-12T10:40:00Z"
        }
      ]
    });
  });

  it("hides revoked peers from public card projection", async () => {
    const router = createHubRouter({
      mode: "managed",
      networkId: "agentpod-public",
      directoryUrl: "https://agentpod.ai/directory",
      substrateUrl: "wss://agentpod.ai/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: [
        {
          peer_id: "peer_123",
          network_id: "agentpod-public",
          display_name: "Design Peer",
          summary: "Helps with product thinking and specs.",
          services: [
            {
              id: "product_brainstorm",
              summary: "Brainstorm product ideas"
            }
          ],
          risk_flags: [],
          visibility: "public",
          operator_verified: true,
          key_fingerprint: "sha256:abcd...",
          last_seen_at: "2026-03-12T10:54:00Z",
          updated_at: "2026-03-12T10:40:00Z"
        }
      ]
    });

    const revoke = await router.handle({
      method: "POST",
      path: "/v1/tokens/revoke",
      headers: {
        authorization: "Bearer operator-secret"
      },
      body: {
        peer_id: "peer_123",
        key_fingerprint: "sha256:abcd...",
        reason: "owner-requested-rotation"
      }
    });

    expect(revoke.status).toBe(200);

    const response = await router.handle({
      method: "GET",
      path: "/v1/public-cards"
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ cards: [] });
  });

  it("lets private mode skip managed join endpoints while keeping projection surfaces", async () => {
    const router = createHubRouter({
      mode: "private",
      networkId: "team-a",
      directoryUrl: "https://agentpod.internal.example.com/directory",
      substrateUrl: "wss://agentpod.internal.example.com/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "team-a-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: [
        {
          peer_id: "peer_private",
          network_id: "team-a",
          display_name: "Private Peer",
          summary: "Private network peer.",
          services: [{ id: "draft_review", summary: "Review drafts" }],
          risk_flags: [],
          visibility: "network_only",
          operator_verified: false,
          last_seen_at: "2026-03-12T10:54:00Z",
          updated_at: "2026-03-12T10:40:00Z"
        }
      ]
    });

    const joinManifest = await router.handle({
      method: "GET",
      path: "/v1/networks/team-a/join-manifest"
    });

    expect(joinManifest.status).toBe(404);

    const exchange = await router.handle({
      method: "POST",
      path: "/v1/join/exchange",
      body: {
        network_id: "team-a",
        peer_id: "peer_private",
        public_key: "base64...",
        key_fingerprint: "sha256:private...",
        proof: {
          signed_at: "2026-03-12T10:01:00Z",
          signature: "base64..."
        }
      }
    });

    expect(exchange.status).toBe(404);

    const renew = await router.handle({
      method: "POST",
      path: "/v1/tokens/renew",
      headers: {
        authorization: "Bearer ignored"
      },
      body: {
        peer_id: "peer_private",
        key_fingerprint: "sha256:private..."
      }
    });

    expect(renew.status).toBe(404);

    const response = await router.handle({
      method: "GET",
      path: "/v1/public-cards"
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ cards: [] });
  });

  it("returns typed auth errors instead of throwing on token renew", async () => {
    const router = createHubRouter({
      mode: "managed",
      networkId: "agentpod-public",
      directoryUrl: "https://agentpod.ai/directory",
      substrateUrl: "wss://agentpod.ai/substrate",
      operatorKeyId: "operator-key-2026-03",
      issuer: "agentpod-public-operator",
      manifestSignature: "manifest-signature",
      operatorToken: "operator-secret",
      discoveryRecords: []
    });

    const response = await router.handle({
      method: "POST",
      path: "/v1/tokens/renew",
      body: {
        peer_id: "peer_123",
        key_fingerprint: "sha256:abcd..."
      }
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "token_expired"
    });
  });
});
