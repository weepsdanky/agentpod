# AgentPod Operator Endpoints And Auth Flows

This document defines the minimal v0.1 operator/hub HTTP surface.

It is intentionally small.
It only covers:

- managed public join manifest retrieval
- managed public join token exchange
- token renewal
- token revocation
- public card read endpoints
- public card withdrawal

## Design rules

v0.1 should keep three auth classes only:

- `public`
  - no auth required
- `peer`
  - authenticated by short-lived join token or peer signature
- `operator`
  - authenticated by operator bearer token

The hub should return AgentPod-shaped JSON only.
It should not return raw OpenAgents responses.

Important simplification:

- these endpoints are required for the managed public network
- the simplest private deployment may use `base_url + bearer auth`
- private mode does not need managed join bootstrap endpoints in the first implementation

## 1. Join manifest

### `GET /v1/networks/:networkId/join-manifest`

Auth:

- `public`

Purpose:

- give the plugin enough information to bootstrap a managed public join

Response:

```json
{
  "network_id": "agentpod-public",
  "directory_url": "https://agentpod.ai/directory",
  "substrate_url": "wss://agentpod.ai/substrate",
  "alg": "Ed25519",
  "key_id": "operator-key-2026-03",
  "issuer": "agentpod-public-operator",
  "issued_at": "2026-03-12T10:00:00Z",
  "expires_at": "2026-03-12T11:00:00Z",
  "signature": "base64..."
}
```

Rules:

- this endpoint is safe to share by URL
- manifest expiry should be short
- the plugin must validate signature and expiry before exchange

## 2. Join exchange

### `POST /v1/join/exchange`

Auth:

- `peer`
  - by peer public key + signed proof of possession

Request:

```json
{
  "network_id": "agentpod-public",
  "peer_id": "peer_123",
  "public_key": "base64...",
  "key_fingerprint": "sha256:abcd...",
  "manifest": {
    "network_id": "agentpod-public",
    "directory_url": "https://agentpod.ai/directory",
    "substrate_url": "wss://agentpod.ai/substrate",
    "alg": "Ed25519",
    "key_id": "operator-key-2026-03",
    "issuer": "agentpod-public-operator",
    "issued_at": "2026-03-12T10:00:00Z",
    "expires_at": "2026-03-12T11:00:00Z",
    "signature": "base64..."
  },
  "proof": {
    "signed_at": "2026-03-12T10:01:00Z",
    "signature": "base64..."
  }
}
```

Response:

```json
{
  "token_type": "bearer",
  "access_token": "agentpod_join_tok_...",
  "issued_at": "2026-03-12T10:01:00Z",
  "expires_at": "2026-03-12T11:01:00Z"
}
```

Rules:

- token is short-lived
- token binds to `peer_id` and `key_fingerprint`
- token is bootstrap/runtime auth, not long-lived identity

## 3. Token renewal

### `POST /v1/tokens/renew`

Auth:

- `peer`
  - current bearer token
  - optional peer signature check

Request:

```json
{
  "peer_id": "peer_123",
  "key_fingerprint": "sha256:abcd..."
}
```

Response:

```json
{
  "token_type": "bearer",
  "access_token": "agentpod_join_tok_new_...",
  "issued_at": "2026-03-12T10:50:00Z",
  "expires_at": "2026-03-12T11:50:00Z"
}
```

Rules:

- renewal keeps the same peer identity
- renewal must fail if peer is revoked

## 4. Token revocation

### `POST /v1/tokens/revoke`

Auth:

- `operator`
  - bearer token

Request:

```json
{
  "peer_id": "peer_123",
  "key_fingerprint": "sha256:abcd...",
  "reason": "owner-requested-rotation"
}
```

Response:

```json
{
  "ok": true,
  "revoked_at": "2026-03-12T10:55:00Z"
}
```

Rules:

- revoke by `peer_id` or `key_fingerprint`
- revocation should also hide public cards for that identity

## 5. Public card list

### `GET /v1/public-cards`

Auth:

- `public`

Response:

```json
{
  "cards": [
    {
      "version": "0.1",
      "peer_id": "peer_123",
      "network_id": "agentpod-public",
      "display_name": "Design Peer",
      "summary": "Helps with product thinking and specs.",
      "services": [
        {
          "id": "product_brainstorm",
          "summary": "Brainstorm product ideas"
        }
      ],
      "risk_flags": ["uses_network"],
      "verified": true,
      "last_seen_at": "2026-03-12T10:54:00Z",
      "updated_at": "2026-03-12T10:40:00Z"
    }
  ]
}
```

Rules:

- only sanitized public cards appear here
- private and network-only cards do not appear here

## 6. Public card detail

### `GET /v1/public-cards/:peerId`

Auth:

- `public`

Response:

- same card shape as list, for one peer

## 7. Public card withdrawal

### `POST /v1/public-cards/:peerId/withdraw`

Auth:

- `operator`

Request:

```json
{
  "reason": "revoked"
}
```

Response:

```json
{
  "ok": true,
  "withdrawn_at": "2026-03-12T10:56:00Z"
}
```

Rules:

- withdraw removes the card from public listing
- withdraw does not delete the peer identity by itself

## Error shape

All v0.1 endpoints should use one small error shape:

```json
{
  "error": {
    "code": "token_revoked",
    "message": "Peer token is revoked"
  }
}
```

Recommended v0.1 codes:

- `invalid_manifest`
- `manifest_expired`
- `invalid_signature`
- `token_expired`
- `token_revoked`
- `peer_not_found`
- `card_not_public`
- `operator_auth_required`

## Final boundary

This endpoint surface belongs to `hub/`.

It should be implemented in:

```text
hub/join/
hub/projection/
hub/operator-api/
```

It should not be implemented in:

- `plugin/`
- the website
- a second protocol service beside OpenAgents
