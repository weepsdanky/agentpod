import { describe, expect, it } from "vitest";

import { createPluginHttpRouter } from "../http/routes";

describe("AgentPod plugin HTTP routes", () => {
  it("accepts authenticated plugin-owned artifact ingress", async () => {
    const router = createPluginHttpRouter({
      pluginToken: "plugin-secret"
    });

    const response = await router.handle({
      method: "POST",
      path: "/agentpod/artifacts/ingest",
      headers: {
        authorization: "Bearer plugin-secret"
      },
      body: {
        artifact_id: "artifact_123"
      }
    });

    expect(response).toEqual({
      status: 200,
      body: {
        ok: true,
        artifact_id: "artifact_123"
      }
    });
  });

  it("rejects unauthenticated plugin-owned routes", async () => {
    const router = createPluginHttpRouter({
      pluginToken: "plugin-secret"
    });

    const response = await router.handle({
      method: "POST",
      path: "/agentpod/artifacts/ingest",
      body: {
        artifact_id: "artifact_123"
      }
    });

    expect(response).toEqual({
      status: 401,
      body: {
        error: "plugin_auth_required"
      }
    });
  });
});
