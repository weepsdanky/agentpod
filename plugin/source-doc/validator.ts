import type {
  AdmissionPolicy,
  ArtifactPolicy,
  ServiceSpec,
  ToolUsePolicy
} from "../types/agentpod";

const REQUIRED_SECTIONS = ["Summary", "Services", "Inputs", "Outputs", "Safety"] as const;
const SERVICE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export interface CompileSourceOptions {
  peerId: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
}

export interface ParsedSourceDoc {
  summary: string;
  services: ServiceSpec[];
}

interface ParsedSections {
  Summary: string;
  Services: string;
  Inputs: string;
  Outputs: string;
  Safety: string;
}

interface SharedIoShape {
  payload_types: string[];
  attachment_types: string[];
  result_types: string[];
  artifact?: ArtifactPolicy;
}

interface ParsedServiceDefaults {
  id: string;
  summary: string;
  admission?: AdmissionPolicy;
  tool_use?: ToolUsePolicy;
}

export function validateAgentPodSource(source: string): ParsedSourceDoc {
  const sections = extractSections(source);
  const sharedIo = parseSharedIo(sections);
  const serviceDefaults = parseServiceDefaults(sections.Services);

  return {
    summary: normalizeInlineText(sections.Summary),
    services: serviceDefaults.map((service): ServiceSpec => ({
      id: service.id,
      summary: service.summary,
      io: {
        payload_types: sharedIo.payload_types,
        attachment_types: sharedIo.attachment_types,
        result_types: sharedIo.result_types
      },
      policy: buildServicePolicy(service, sharedIo)
    }))
  };
}

function buildServicePolicy(
  service: ParsedServiceDefaults,
  sharedIo: SharedIoShape
): ServiceSpec["policy"] | undefined {
  const policy = {
    ...(service.admission ? { admission: service.admission } : {}),
    ...(service.tool_use ? { tool_use: service.tool_use } : {}),
    ...(sharedIo.artifact ? { artifact: sharedIo.artifact } : {})
  };

  return Object.keys(policy).length > 0 ? policy : undefined;
}

function extractSections(source: string): ParsedSections {
  const sections = new Map<string, string>();
  const lines = source.split(/\r?\n/);
  let currentHeading: string | undefined;
  let currentBody: string[] = [];

  for (const line of lines) {
    if (line.startsWith("# ") && !line.startsWith("## ")) {
      if (currentHeading) {
        sections.set(currentHeading, currentBody.join("\n").trim());
      }
      currentHeading = line.slice(2).trim();
      currentBody = [];
      continue;
    }

    if (currentHeading) {
      currentBody.push(line);
    }
  }

  if (currentHeading) {
    sections.set(currentHeading, currentBody.join("\n").trim());
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!sections.has(section)) {
      throw new Error(`Missing required section: ${section}`);
    }
  }

  return {
    Summary: sections.get("Summary") ?? "",
    Services: sections.get("Services") ?? "",
    Inputs: sections.get("Inputs") ?? "",
    Outputs: sections.get("Outputs") ?? "",
    Safety: sections.get("Safety") ?? ""
  };
}

function parseSharedIo(sections: ParsedSections): SharedIoShape {
  const payloadTypes = parseCsvBullet(sections.Inputs, "accepted payload types");
  const attachmentTypes = parseCsvBullet(sections.Inputs, "accepted attachment types");
  const resultTypes = parseCsvBullet(sections.Outputs, "result types");
  const artifactBehavior = parseOptionalValue(sections.Outputs, "artifact behavior");

  return {
    payload_types: payloadTypes,
    attachment_types: attachmentTypes,
    result_types: resultTypes,
    artifact: artifactBehavior ? parseArtifactPolicy(artifactBehavior) : undefined
  };
}

function parseServiceDefaults(servicesSection: string): ParsedServiceDefaults[] {
  const services: Array<{ id: string; body: string }> = [];
  const lines = servicesSection.split(/\r?\n/);
  let currentId: string | undefined;
  let currentBody: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentId) {
        services.push({ id: currentId, body: currentBody.join("\n").trim() });
      }
      currentId = line.slice(3).trim();
      currentBody = [];
      continue;
    }

    if (currentId) {
      currentBody.push(line);
    }
  }

  if (currentId) {
    services.push({ id: currentId, body: currentBody.join("\n").trim() });
  }

  if (services.length === 0) {
    throw new Error("Missing required section content: Services");
  }

  const seenIds = new Set<string>();

  return services.map((service) => {
    const id = service.id;
    const body = service.body;

    if (!SERVICE_ID_PATTERN.test(id)) {
      throw new Error(`Invalid service id: ${id}`);
    }

    if (seenIds.has(id)) {
      throw new Error(`Duplicate service id: ${id}`);
    }
    seenIds.add(id);

    const summary = parseRequiredValue(body, "summary");
    const admissionDefault = parseOptionalValue(body, "admission default");
    const toolUseDefault = parseOptionalValue(body, "tool use default");

    return {
      id,
      summary: normalizeInlineText(summary),
      admission: admissionDefault ? parseAdmissionPolicy(admissionDefault) : undefined,
      tool_use: toolUseDefault ? parseToolUsePolicy(toolUseDefault) : undefined
    };
  });
}

function parseRequiredValue(section: string, label: string): string {
  const value = parseOptionalValue(section, label);
  if (!value) {
    throw new Error(`Missing required field: ${label}`);
  }
  return value;
}

function parseOptionalValue(section: string, label: string): string | undefined {
  const pattern = new RegExp(`^- ${escapeRegExp(label)}:\\s*(.+)$`, "im");
  const match = section.match(pattern);
  return match?.[1]?.trim();
}

function parseCsvBullet(section: string, label: string): string[] {
  return parseRequiredValue(section, label)
    .split(",")
    .map((value) => normalizeBulletValue(value))
    .filter(Boolean);
}

function parseArtifactPolicy(value: string): ArtifactPolicy {
  const normalized = normalizeBulletValue(value);

  if (normalized === "inline_only" || normalized === "allow_links") {
    return normalized;
  }

  if (normalized === "inline summary by default") {
    return "inline_only";
  }

  throw new Error(`Unsupported artifact behavior: ${value}`);
}

function parseAdmissionPolicy(value: string): AdmissionPolicy {
  if (value === "auto" || value === "owner_confirm") {
    return value;
  }
  throw new Error(`Unsupported admission default: ${value}`);
}

function parseToolUsePolicy(value: string): ToolUsePolicy {
  if (value === "allow" || value === "ask" || value === "deny") {
    return value;
  }
  throw new Error(`Unsupported tool use default: ${value}`);
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeBulletValue(value: string): string {
  return value.trim().replace(/^`(.+)`$/, "$1");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
