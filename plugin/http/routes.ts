interface PluginHttpRequest {
  method: "POST" | "GET";
  path: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

interface PluginHttpResponse {
  status: number;
  body: Record<string, unknown>;
}

export function createPluginHttpRouter({
  pluginToken
}: {
  pluginToken: string;
}) {
  return {
    async handle(request: PluginHttpRequest): Promise<PluginHttpResponse> {
      if (
        request.method === "POST" &&
        request.path === "/agentpod/artifacts/ingest"
      ) {
        if (request.headers?.authorization !== `Bearer ${pluginToken}`) {
          return {
            status: 401,
            body: {
              error: "plugin_auth_required"
            }
          };
        }

        return {
          status: 200,
          body: {
            ok: true,
            artifact_id: String(request.body?.artifact_id ?? "")
          }
        };
      }

      return {
        status: 404,
        body: {
          error: "not_found"
        }
      };
    }
  };
}
