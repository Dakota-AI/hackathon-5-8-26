#!/usr/bin/env node

import { readSync } from "node:fs";

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

if (command !== "notify" && command !== "call") {
  usage();
  process.exit(2);
}

const baseUrl = trimTrailingSlash(
  process.env.AGENTS_USER_ENGAGEMENT_URL ?? "http://127.0.0.1:8787/engagement"
);
const token = process.env.AGENTS_USER_ENGAGEMENT_TOKEN;
const runId = args["run-id"] ?? process.env.RUN_ID ?? process.env.AGENTS_CLOUD_RUN_ID;
const taskId = args["task-id"] ?? process.env.TASK_ID ?? process.env.AGENTS_CLOUD_TASK_ID;
const workspaceId =
  args["workspace-id"] ?? process.env.WORKSPACE_ID ?? process.env.AGENTS_CLOUD_WORKSPACE_ID;
const targetUserId = args["user-id"] ?? process.env.USER_ID ?? process.env.AGENTS_CLOUD_USER_ID;
const agentId = args["agent-id"] ?? process.env.AGENT_ID ?? process.env.AGENTS_CLOUD_AGENT_ID;
const title = args.title;
const deepLink = args["deep-link"];
const urgency = args.urgency;

const body =
  command === "call"
    ? args.summary ?? args.body ?? readStdinIfRequested(args)
    : args.body ?? readStdinIfRequested(args);

if (!runId || !runId.trim()) {
  fail("Missing run id. Pass --run-id or run inside the resident runner Hermes environment.");
}
if (!body || !body.trim()) {
  fail(command === "call" ? "Missing call summary. Pass --summary." : "Missing notification body. Pass --body.");
}

const payload = pruneUndefined({
  runId,
  taskId,
  workspaceId,
  targetUserId,
  agentId,
  title,
  body: command === "notify" ? body : undefined,
  summary: command === "call" ? body : undefined,
  urgency,
  deepLink,
  idempotencyKey: args["idempotency-key"]
});

const headers = { "content-type": "application/json" };
if (token) {
  headers.authorization = `Bearer ${token}`;
}

const response = await fetch(`${baseUrl}/${command === "call" ? "call" : "notify"}`, {
  method: "POST",
  headers,
  body: JSON.stringify(payload)
});
const text = await response.text();
let decoded;
try {
  decoded = text ? JSON.parse(text) : {};
} catch {
  decoded = { raw: text };
}

if (!response.ok) {
  console.error(JSON.stringify({ ok: false, status: response.status, response: decoded }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(decoded, null, 2));

function parseArgs(items) {
  const parsed = {};
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item.startsWith("--")) {
      fail(`Unexpected argument: ${item}`);
    }
    const eq = item.indexOf("=");
    if (eq > 2) {
      parsed[item.slice(2, eq)] = item.slice(eq + 1);
      continue;
    }
    const key = item.slice(2);
    if (key === "stdin") {
      parsed.stdin = "1";
      continue;
    }
    const next = items[i + 1];
    if (!next || next.startsWith("--")) {
      fail(`Missing value for --${key}`);
    }
    parsed[key] = next;
    i += 1;
  }
  return parsed;
}

function readStdinIfRequested(parsed) {
  if (parsed.stdin !== "1") return undefined;
  return awaitReadableStdin();
}

function awaitReadableStdin() {
  const chunks = [];
  const buffer = new Uint8Array(1024);
  let bytesRead = 0;
  while ((bytesRead = fsReadSync(0, buffer, 0, buffer.length)) > 0) {
    chunks.push(Buffer.from(buffer.slice(0, bytesRead)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function fsReadSync(fd, buffer, offset, length) {
  try {
    return readSync(fd, buffer, offset, length);
  } catch {
    return 0;
  }
}

function pruneUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function fail(message) {
  console.error(message);
  usage();
  process.exit(2);
}

function usage() {
  console.error(`Usage:
  agents-cloud-user notify --body "message" [--title "title"] [--urgency low|normal|high]
  agents-cloud-user call --summary "why to call" [--title "title"]`);
}
