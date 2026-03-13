#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin_dir="${repo_root}/plugin"

echo "Linking AgentPod plugin from ${plugin_dir}"
openclaw plugins install -l "${plugin_dir}"
openclaw plugins enable agentpod

echo
echo "Next steps:"
echo "  1. Configure plugins.entries.agentpod.config in your OpenClaw config."
echo "  2. Start a local hub with: pnpm hub:dev -- --bind 127.0.0.1:4590 --mode private --network-id team-a"
echo "  3. Restart OpenClaw after config changes."
