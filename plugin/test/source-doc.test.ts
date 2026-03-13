import { describe, expect, it } from "vitest";

import { compileAgentPodSource } from "../source-doc/compiler";

const compileOptions = {
  peerId: "peer_123",
  issuedAt: "2026-03-12T10:40:00Z",
  expiresAt: "2026-04-12T10:40:00Z",
  signature: "base64..."
};

describe("AGENTPOD.md compiler", () => {
  it("compiles a minimal valid source document", () => {
    const source = `# Summary

Helps brainstorm product ideas and structure specs.

# Services

## product_brainstorm
- summary: Brainstorm product directions.
- when to use: Use this for MVP shaping.

# Inputs
- accepted payload types: text/plain, text/markdown
- accepted attachment types: application/pdf, image/*

# Outputs
- result types: text/markdown, application/json
- artifact behavior: allow_links

# Safety
- notable limits: Does not execute destructive actions.
`;

    const manifest = compileAgentPodSource(source, compileOptions);

    expect(manifest.peer_id).toBe("peer_123");
    expect(manifest.services).toHaveLength(1);
    expect(manifest.services[0]).toMatchObject({
      id: "product_brainstorm",
      summary: "Brainstorm product directions.",
      io: {
        payload_types: ["text/plain", "text/markdown"],
        attachment_types: ["application/pdf", "image/*"],
        result_types: ["text/markdown", "application/json"]
      },
      policy: {
        artifact: "allow_links"
      }
    });
  });

  it("rejects duplicate service ids", () => {
    const source = `# Summary

Shared summary.

# Services

## product_brainstorm
- summary: First service.

## product_brainstorm
- summary: Duplicate service.

# Inputs
- accepted payload types: text/plain
- accepted attachment types: application/pdf

# Outputs
- result types: text/markdown
- artifact behavior: inline_only

# Safety
- notable limits: None.
`;

    expect(() => compileAgentPodSource(source, compileOptions)).toThrow(
      /duplicate service id/i
    );
  });

  it("rejects invalid service ids", () => {
    const source = `# Summary

Shared summary.

# Services

## Product Brainstorm
- summary: Invalid id format.

# Inputs
- accepted payload types: text/plain
- accepted attachment types: application/pdf

# Outputs
- result types: text/markdown
- artifact behavior: inline_only

# Safety
- notable limits: None.
`;

    expect(() => compileAgentPodSource(source, compileOptions)).toThrow(
      /invalid service id/i
    );
  });

  it("rejects missing required sections", () => {
    const source = `# Summary

Shared summary.

# Services

## product_brainstorm
- summary: Brainstorm product directions.

# Inputs
- accepted payload types: text/plain
- accepted attachment types: application/pdf
`;

    expect(() => compileAgentPodSource(source, compileOptions)).toThrow(
      /missing required section/i
    );
  });

  it("parses optional policy defaults without treating them as required", () => {
    const source = `# Summary

Shared summary.

# Services

## product_brainstorm
- summary: Brainstorm product directions.
- tool use default: ask
- admission default: owner_confirm

# Inputs
- accepted payload types: text/plain
- accepted attachment types: application/pdf

# Outputs
- result types: text/markdown
- artifact behavior: allow_links

# Safety
- notable limits: Ask before network actions.
`;

    const manifest = compileAgentPodSource(source, compileOptions);

    expect(manifest.services[0]?.policy).toMatchObject({
      tool_use: "ask",
      admission: "owner_confirm",
      artifact: "allow_links"
    });
  });

  it("accepts the getting-started inline artifact wording", () => {
    const source = `# Summary

Shared summary.

# Services

## product_brainstorm
- summary: Brainstorm product directions.

# Inputs
- accepted payload types: text/plain
- accepted attachment types: application/pdf

# Outputs
- result types: text/markdown
- artifact behavior: inline summary by default

# Safety
- notable limits: None.
`;

    const manifest = compileAgentPodSource(source, compileOptions);

    expect(manifest.services[0]?.policy).toMatchObject({
      artifact: "inline_only"
    });
  });

  it("strips markdown code formatting from IO type bullets", () => {
    const source = `# Summary

Shared summary.

# Services

## product_brainstorm
- summary: Brainstorm product directions.

# Inputs
- accepted payload types: \`text/plain\`, \`text/markdown\`
- accepted attachment types: \`application/pdf\`

# Outputs
- result types: \`text/markdown\`
- artifact behavior: inline_only

# Safety
- notable limits: None.
`;

    const manifest = compileAgentPodSource(source, compileOptions);

    expect(manifest.services[0]?.io).toEqual({
      payload_types: ["text/plain", "text/markdown"],
      attachment_types: ["application/pdf"],
      result_types: ["text/markdown"]
    });
  });
});
