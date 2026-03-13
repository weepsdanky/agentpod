import type { HubConfig } from "../config/schema";
import { createJoinManifest } from "../join/manifest";
import { createRevocationStore } from "../join/revocation";
import { createTokenStore, type JoinExchangeRequest } from "../join/token-issuer";
import { renewToken, type TokenRenewRequest } from "../join/token-renew";
import { createInMemoryDiscoveryWiring, type DiscoveryRecord } from "../openagents/wiring";
import { projectPublicCards } from "../projection/public-card";

type HttpMethod = "GET" | "POST";

interface RouterRequest {
  method: HttpMethod;
  path: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

interface RouterResponse {
  status: number;
  body: Record<string, unknown>;
}

interface HubRouterConfig extends HubConfig {
  discoveryRecords: DiscoveryRecord[];
}

export function createHubRouter(config: HubRouterConfig) {
  const revocations = createRevocationStore();
  const tokens = createTokenStore(config, revocations);
  const discovery = createInMemoryDiscoveryWiring(config.discoveryRecords);

  return {
    async handle(request: RouterRequest): Promise<RouterResponse> {
      if (
        request.method === "GET" &&
        request.path === `/v1/networks/${config.networkId}/join-manifest`
      ) {
        if (config.mode !== "managed") {
          return { status: 404, body: { error: "not_found" } };
        }
        return { status: 200, body: createJoinManifest(config) };
      }

      if (request.method === "POST" && request.path === "/v1/join/exchange") {
        if (config.mode !== "managed") {
          return { status: 404, body: { error: "not_found" } };
        }
        return {
          status: 200,
          body: tokens.exchange(parseJoinExchangeRequest(request.body))
        };
      }

      if (request.method === "POST" && request.path === "/v1/tokens/renew") {
        if (config.mode !== "managed") {
          return { status: 404, body: { error: "not_found" } };
        }
        const bearerToken = request.headers?.authorization?.replace(/^Bearer\s+/i, "");
        try {
          return {
            status: 200,
            body: renewToken(
              bearerToken,
              parseTokenRenewRequest(request.body),
              tokens,
              revocations
            )
          };
        } catch (error) {
          return mapJoinAuthError(error);
        }
      }

      if (request.method === "POST" && request.path === "/v1/tokens/revoke") {
        if (request.headers?.authorization !== `Bearer ${config.operatorToken}`) {
          return { status: 401, body: { error: "operator_auth_required" } };
        }

        return {
          status: 200,
          body: revocations.revoke(request.body ?? {})
        };
      }

      if (request.method === "GET" && request.path === "/v1/public-cards") {
        return {
          status: 200,
          body: {
            cards: projectPublicCards(discovery.listRecords(), revocations)
          }
        };
      }

      const publicCardMatch = request.method === "GET"
        ? request.path.match(/^\/v1\/public-cards\/([^/]+)$/)
        : null;
      if (publicCardMatch) {
        const card = projectPublicCards(discovery.listRecords(), revocations).find(
          (record) => record.peer_id === publicCardMatch[1]
        );
        return card
          ? { status: 200, body: card }
          : { status: 404, body: { error: "card_not_public" } };
      }

      return { status: 404, body: { error: "not_found" } };
    }
  };
}

function mapJoinAuthError(error: unknown): RouterResponse {
  const message = error instanceof Error ? error.message : "";

  if (message === "Missing bearer token" || message === "Unknown bearer token") {
    return { status: 401, body: { error: "token_expired" } };
  }

  if (message === "Peer revoked") {
    return { status: 403, body: { error: "token_revoked" } };
  }

  if (message === "Peer identity mismatch") {
    return { status: 400, body: { error: "invalid_signature" } };
  }

  return { status: 400, body: { error: "invalid_request" } };
}

function parseJoinExchangeRequest(body: Record<string, unknown> | undefined): JoinExchangeRequest {
  const request = (body ?? {}) as Partial<JoinExchangeRequest>;

  return {
    network_id: String(request.network_id ?? ""),
    peer_id: String(request.peer_id ?? ""),
    public_key: String(request.public_key ?? ""),
    key_fingerprint: String(request.key_fingerprint ?? ""),
    proof:
      request.proof && typeof request.proof === "object"
        ? {
            signed_at: String((request.proof as { signed_at?: unknown }).signed_at ?? ""),
            signature: String((request.proof as { signature?: unknown }).signature ?? "")
          }
        : undefined
  };
}

function parseTokenRenewRequest(body: Record<string, unknown> | undefined): TokenRenewRequest {
  const request = (body ?? {}) as Partial<TokenRenewRequest>;

  return {
    peer_id: String(request.peer_id ?? ""),
    key_fingerprint: String(request.key_fingerprint ?? "")
  };
}
