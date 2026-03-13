# Contributing to AgentPod

Thank you for your interest in contributing to AgentPod.

## Getting started

```bash
git clone https://github.com/WeepsDanky/agentpod
cd agentpod
pnpm install
pnpm test
```

All 55 tests should pass before you begin. If any fail, open an issue.

## Project layout

```
plugin/    OpenClaw plugin — tools, service, state, identity, policy, tasks, artifacts
hub/       Thin operator hub — join, tokens, public-card projection, OpenAgents wiring
test/      Integration tests
docs/      Protocol docs and architecture
examples/  Ready-to-use openclaw.json configs
scripts/   Dev runbooks and helper scripts
```

See [docs/repo-structure.md](docs/repo-structure.md) for full ownership rules.

## Where to contribute

| Area | Directory |
|---|---|
| New tools (`agentpod_peers`, `agentpod_delegate`, etc.) | `plugin/tools/` |
| Slash commands or CLI subcommands | `plugin/commands/` |
| Background service or peer cache | `plugin/service/` |
| AGENTPOD.md compiler/validator | `plugin/source-doc/` |
| Policy and execution safety | `plugin/policy/` and `plugin/tasks/` |
| Shared protocol types | `plugin/types/agentpod.d.ts` |
| Hub join / token endpoints | `hub/join/` |
| Public card projection | `hub/projection/` |
| OpenAgents adapter | `hub/openagents/wiring.ts` |
| Integration tests | `test/integration/` |
| Docs and examples | `docs/`, `examples/` |

## Development workflow

**Run the test suite:**
```bash
pnpm test
```

**Typecheck:**
```bash
pnpm exec tsc --noEmit
```

**Start a local hub:**
```bash
pnpm hub:dev -- --bind 127.0.0.1:4590 --mode private --network-id team-a
```

**Link the plugin into a local OpenClaw checkout:**
```bash
./scripts/dev-openclaw-link.sh
```

## Pull request guidelines

- Keep PRs focused. One concern per PR.
- All tests must pass: `pnpm test`.
- Typecheck must be clean: `pnpm exec tsc --noEmit`.
- Match the existing code style (TypeScript strict mode, no `any`, no unused vars).
- New behaviour should come with a test.
- Do not add dependencies without discussion — the goal is a lean, auditable plugin.

## Adding a new protocol type

Protocol types live in `plugin/types/agentpod.d.ts`. Both `plugin/` and `hub/` import from there.

Rules:
- Keep the shape flat and explicit.
- Version new object shapes with a `version` field.
- Do not import OpenAgents or OpenClaw types into this file.

## Opening issues

Before opening a bug or feature request, check the existing issues.

For bugs, include:
- OS and Node.js version
- Steps to reproduce
- Expected vs. actual behaviour
- Relevant log output

For feature requests, explain the use case first — what problem does it solve?

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
All contributors are expected to uphold it.
