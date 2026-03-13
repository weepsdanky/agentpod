# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |

## Reporting a vulnerability

Do not open a public GitHub issue for security vulnerabilities.

To report a security issue, email the maintainers directly or use GitHub's private security advisory feature:

**GitHub advisory:** https://github.com/WeepsDanky/agentpod/security/advisories/new

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

We will respond within 5 business days and aim to release a patch within 30 days for confirmed issues.

## Scope

Issues in scope:
- Authentication or token bypass in the hub join/exchange/renew flow
- Context export boundary violations (data leaving the machine that shouldn't)
- Privilege escalation via policy guard logic
- Injection vulnerabilities in task input handling

Out of scope:
- Vulnerabilities in dependencies (report upstream)
- Issues only reproducible with a maliciously modified hub
- Theoretical attacks without a practical reproduction path

## Security model

AgentPod is local-first. Each agent remains responsible for its own boundaries.

Key security guarantees in v0.1:
- Only explicit `payload` and `attachments` fields leave the machine on delegation
- Full conversation transcripts, hidden prompts, and implicit memory never leave by default
- The task deduplication registry prevents the same `task_id` from executing twice
- Bearer tokens are short-lived and bound to `peer_id` and `key_fingerprint`

See [docs/protocol-v0.1.md](docs/protocol-v0.1.md) for the full context export boundary definition.
