import type { AgentProfileVersion, ValidationError, ValidationResult } from "./types.js";

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{12,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(APIFY_TOKEN|AWS_SECRET_ACCESS_KEY|SECRET_ACCESS_KEY|PRIVATE_KEY)\b/i,
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/,
];

export function validateAgentProfileVersion(profile: AgentProfileVersion): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  requireField(profile.schemaVersion, "schemaVersion", errors);
  requireField(profile.profileId, "profileId", errors);
  requireField(profile.version, "version", errors);
  requireField(profile.workspaceId, "workspaceId", errors);
  requireField(profile.role, "role", errors);
  requireField(profile.mission, "mission", errors);

  if (!profile.changeLog || profile.changeLog.length === 0) {
    errors.push({
      code: "MISSING_CHANGELOG",
      path: "changeLog",
      message: "Agent profile versions must include changelog/evidence before review or promotion.",
    });
  }

  if (!profile.evalPack || profile.evalPack.scenarios.length === 0) {
    errors.push({
      code: "MISSING_EVAL_SCENARIOS",
      path: "evalPack.scenarios",
      message: "Agent profile versions must include quarantine eval scenarios before review or promotion.",
    });
  }

  const allowedToolIds = new Set(profile.toolPolicy.allowedTools.map((tool) => tool.toolId));
  const approvalToolIds = new Set(profile.toolPolicy.approvalRequiredTools.map((tool) => tool.toolId));
  const deniedToolIds = new Set(profile.toolPolicy.deniedTools.map((tool) => tool.toolId));

  for (const tool of [...profile.toolPolicy.allowedTools, ...profile.toolPolicy.approvalRequiredTools]) {
    if ((tool.risk === "medium" || tool.risk === "high") && !tool.requiresApproval && !approvalToolIds.has(tool.toolId)) {
      errors.push({
        code: "HIGH_RISK_TOOL_WITHOUT_APPROVAL",
        path: `toolPolicy.${tool.toolId}`,
        message: `Tool ${tool.toolId} is ${tool.risk} risk and must require approval.`,
      });
    }
  }

  for (const tool of profile.toolPolicy.allowedTools) {
    if (tool.risk === "medium" || tool.risk === "high") {
      errors.push({
        code: "HIGH_RISK_TOOL_WITHOUT_APPROVAL",
        path: `toolPolicy.allowedTools.${tool.toolId}`,
        message: `Tool ${tool.toolId} is ${tool.risk} risk but appears in allowedTools instead of approvalRequiredTools.`,
      });
    }
  }

  for (const toolId of allowedToolIds) {
    if (approvalToolIds.has(toolId) || deniedToolIds.has(toolId)) {
      errors.push({
        code: "TOOL_POLICY_CONFLICT",
        path: `toolPolicy.${toolId}`,
        message: `Tool ${toolId} appears in conflicting policy lists.`,
      });
    }
  }

  if (profile.mcpPolicy.allowDynamicServers && profile.mcpPolicy.allowedServers.length === 0) {
    errors.push({
      code: "DYNAMIC_MCP_WITHOUT_ALLOWLIST",
      path: "mcpPolicy.allowDynamicServers",
      message: "Dynamic MCP servers require an explicit allowlist and review policy.",
    });
  }

  for (const server of profile.mcpPolicy.allowedServers) {
    if (!server.pinnedDefinitionHash) {
      errors.push({
        code: "UNPINNED_MCP_SERVER",
        path: `mcpPolicy.allowedServers.${server.id}`,
        message: `MCP server ${server.id} must pin a definition hash before tools are exposed to a profile.`,
      });
    }
    if (server.trustLevel === "untrusted") {
      warnings.push({
        code: "UNPINNED_MCP_SERVER",
        path: `mcpPolicy.allowedServers.${server.id}`,
        message: `MCP server ${server.id} is marked untrusted and should stay blocked until reviewed.`,
      });
    }
  }

  if ((profile.lifecycleState === "approved" || profile.lifecycleState === "promoted") && !profile.approval) {
    errors.push({
      code: "PROMOTION_WITHOUT_APPROVAL",
      path: "approval",
      message: "Approved or promoted profiles must include explicit user approval evidence.",
    });
  }

  const secretPaths = findSecretPatterns(profile);
  for (const path of secretPaths) {
    errors.push({
      code: "SECRET_PATTERN",
      path,
      message: "Profile artifacts must not contain API keys, bearer tokens, private keys, or secret env var names.",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      allowedToolCount: profile.toolPolicy.allowedTools.length,
      approvalRequiredToolCount: profile.toolPolicy.approvalRequiredTools.length,
      evalScenarioCount: profile.evalPack.scenarios.length,
      mcpServerCount: profile.mcpPolicy.allowedServers.length,
    },
  };
}

function requireField(value: unknown, path: string, errors: ValidationError[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push({
      code: "MISSING_REQUIRED_FIELD",
      path,
      message: `${path} is required.`,
    });
  }
}

function findSecretPatterns(value: unknown, path = "$", matches: string[] = []): string[] {
  if (typeof value === "string") {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
      matches.push(path);
    }
    return matches;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => findSecretPatterns(item, `${path}[${index}]`, matches));
    return matches;
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      findSecretPatterns(nested, `${path}.${key}`, matches);
    }
  }

  return matches;
}
