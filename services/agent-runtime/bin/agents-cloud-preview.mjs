#!/usr/bin/env node
import { createPreviewTunnel, runPreviewTunnelAgent } from "../dist/src/preview-tunnel-agent.js";

interface Args {
  readonly command: string;
  readonly port?: number;
  readonly label?: string;
  readonly apiUrl?: string;
  readonly apiToken?: string;
  readonly workspaceId?: string;
  readonly runId?: string;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly ttlMinutes?: number;
  readonly once?: boolean;
  readonly help?: boolean;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.command === "help") {
    console.log(helpText());
    return;
  }
  if (args.command !== "expose") {
    throw new Error(`Unknown command '${args.command}'.\n${helpText()}`);
  }
  const port = args.port ?? numberFromEnv("AGENTS_CLOUD_PREVIEW_PORT") ?? 3000;
  const apiUrl = args.apiUrl ?? process.env.AGENTS_CLOUD_PREVIEW_TUNNEL_API_URL ?? "https://preview.solo-ceo.ai";
  const apiToken = args.apiToken ?? process.env.AGENTS_CLOUD_PREVIEW_TUNNEL_API_TOKEN;
  if (!apiToken) {
    throw new Error("Missing preview API token. Set AGENTS_CLOUD_PREVIEW_TUNNEL_API_TOKEN or pass --api-token.");
  }
  const tunnel = await createPreviewTunnel({
    apiUrl,
    apiToken,
    port,
    label: args.label,
    workspaceId: args.workspaceId ?? process.env.AGENTS_CLOUD_WORKSPACE_ID,
    runId: args.runId ?? process.env.AGENTS_CLOUD_RUN_ID,
    taskId: args.taskId ?? process.env.AGENTS_CLOUD_TASK_ID,
    agentId: args.agentId ?? process.env.AGENTS_CLOUD_AGENT_ID,
    ttlMinutes: args.ttlMinutes
  });
  const artifact = {
    type: "artifact.created",
    payload: {
      kind: "website",
      name: args.label ? `${args.label} live preview` : "Live preview",
      uri: tunnel.previewUrl,
      previewUrl: tunnel.previewUrl,
      metadata: {
        tunnelId: tunnel.tunnelId,
        previewHost: tunnel.previewHost,
        port,
        expiresAt: tunnel.expiresAt,
        mode: "dynamic-port-tunnel"
      }
    }
  };
  console.log(JSON.stringify({ ...tunnel, tunnelToken: "[REDACTED]", artifact }, null, 2));
  if (args.once) return;
  await runPreviewTunnelAgent({
    connectUrl: tunnel.connectUrl,
    port,
    log: (message) => console.error(`[agents-cloud-preview] ${message}`)
  });
}

function parseArgs(argv: string[]): Args {
  const [command = "help", ...rest] = argv;
  const values: Record<string, string | boolean> = { command };
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

function helpText(): string {
  return [
    "Usage:",
    "  agents-cloud-preview expose --port 3000 --label my-app",
    "",
    "Environment:",
    "  AGENTS_CLOUD_PREVIEW_TUNNEL_API_URL    default: https://preview.solo-ceo.ai",
    "  AGENTS_CLOUD_PREVIEW_TUNNEL_API_TOKEN  required shared create-token",
    "",
    "The command creates a public preview tunnel, prints a previewUrl/artifact JSON,",
    "then keeps running to proxy requests to http://127.0.0.1:<port>."
  ].join("\n");
}

function camel(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberFromEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
