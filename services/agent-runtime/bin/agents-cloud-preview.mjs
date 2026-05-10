#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createPreviewTunnel, runPreviewTunnelAgent } from "../dist/src/preview-tunnel-agent.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.command === "help") {
    console.log(helpText());
    return;
  }
  if (args.command !== "expose") {
    throw new Error(`Unknown command '${args.command}'.\n${helpText()}`);
  }

  const port = args.port ?? numberFromEnv("AGENTS_CLOUD_PREVIEW_PORT") ?? 3000;
  const apiUrl = args.apiUrl ?? process.env.AGENTS_CLOUD_PREVIEW_TUNNEL_API_URL ?? "https://preview-api.solo-ceo.ai";
  const apiToken = args.apiToken ?? process.env.AGENTS_CLOUD_PREVIEW_TUNNEL_API_TOKEN;
  if (!apiToken) {
    throw new Error("Missing preview API token. Set AGENTS_CLOUD_PREVIEW_TUNNEL_API_TOKEN or pass --api-token.");
  }

  const runId = args.runId ?? process.env.AGENTS_CLOUD_RUN_ID;
  const taskId = args.taskId ?? process.env.AGENTS_CLOUD_TASK_ID;
  const agentId = args.agentId ?? process.env.AGENTS_CLOUD_AGENT_ID;
  const label = args.label ?? "live-preview";

  const tunnel = await createPreviewTunnel({
    apiUrl,
    apiToken,
    port,
    label,
    workspaceId: args.workspaceId ?? process.env.AGENTS_CLOUD_WORKSPACE_ID,
    runId,
    taskId,
    agentId,
    ttlMinutes: args.ttlMinutes
  });

  const artifactId = args.artifactId ?? previewArtifactId({ runId, taskId, tunnelId: tunnel.tunnelId });
  const artifactEvent = {
    type: "artifact.created",
    payload: {
      artifactId,
      kind: "website",
      name: `${label} live preview`,
      uri: tunnel.previewUrl,
      contentType: "text/html; charset=utf-8",
      previewUrl: tunnel.previewUrl,
      metadata: {
        tunnelId: tunnel.tunnelId,
        previewHost: tunnel.previewHost,
        port,
        expiresAt: tunnel.expiresAt,
        mode: "dynamic-port-tunnel",
        toolId: "preview.expose_dynamic_site"
      }
    }
  };

  const publicResult = {
    ...tunnel,
    connectUrl: redactToken(tunnel.connectUrl),
    tunnelToken: "[REDACTED]",
    artifact: artifactEvent
  };
  console.log(JSON.stringify(publicResult, null, 2));
  console.log("```agents-cloud-event");
  console.log(JSON.stringify(artifactEvent));
  console.log("```");

  if (args.once) return;
  await runPreviewTunnelAgent({
    connectUrl: tunnel.connectUrl,
    port,
    log: (message) => console.error(`[agents-cloud-preview] ${message}`)
  });
}

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const values = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--")) continue;
    const key = camel(arg.slice(2));
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      values[key] = true;
    } else {
      values[key] = next;
      index += 1;
    }
  }
  return {
    command,
    port: numberValue(values.port),
    label: stringValue(values.label),
    artifactId: stringValue(values.artifactId),
    apiUrl: stringValue(values.apiUrl),
    apiToken: stringValue(values.apiToken),
    workspaceId: stringValue(values.workspaceId),
    runId: stringValue(values.runId),
    taskId: stringValue(values.taskId),
    agentId: stringValue(values.agentId),
    ttlMinutes: numberValue(values.ttlMinutes),
    once: values.once === true,
    help: values.help === true
  };
}

function helpText() {
  return [
    "Usage:",
    "  agents-cloud-preview expose --port 3000 --label my-app",
    "  agents-cloud-preview expose --port 3000 --label my-app --once",
    "",
    "Environment:",
    "  AGENTS_CLOUD_PREVIEW_TUNNEL_API_URL    default: https://preview-api.solo-ceo.ai",
    "  AGENTS_CLOUD_PREVIEW_TUNNEL_API_TOKEN  required shared create-token",
    "  AGENTS_CLOUD_RUN_ID / TASK_ID / AGENT_ID are included in emitted artifacts when present",
    "",
    "The command creates a public preview tunnel, prints redacted JSON plus a fenced",
    "agents-cloud-event artifact.created block, then keeps running to proxy requests",
    "to http://127.0.0.1:<port>. Use --once only for registration/smoke tests."
  ].join("\n");
}

function previewArtifactId({ runId, taskId, tunnelId }) {
  const base = ["preview", taskId ?? runId ?? tunnelId].filter(Boolean).join("-");
  const safe = base.toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  if (safe.length > 0) return safe;
  return `preview-${createHash("sha256").update(tunnelId).digest("hex").slice(0, 12)}`;
}

function redactToken(value) {
  try {
    const url = new URL(value);
    if (url.searchParams.has("tunnel_token")) {
      url.searchParams.set("tunnel_token", "[REDACTED]");
    }
    return url.toString();
  } catch {
    return String(value).replace(/(tunnel_token=)[^&\s]+/g, "$1[REDACTED]");
  }
}

function camel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberFromEnv(name) {
  const value = process.env[name];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
