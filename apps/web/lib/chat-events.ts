import type { RunEvent, WorkItemRecord } from "./control-api";

export type ChatTurnRole = "user" | "assistant" | "system" | "tool";
export type ChatTurnKind = "message" | "event" | "artifact" | "approval";

export type ChatTurn = {
  id: string;
  role: ChatTurnRole;
  kind: ChatTurnKind;
  text: string;
  meta?: string;
  ts?: string;
  actorLabel?: string;
  artifact?: {
    artifactId?: string;
    kind?: string;
    name: string;
    uri?: string;
    previewUrl?: string;
  };
};

export function buildChatTurns({ workItem, events }: { workItem: WorkItemRecord | null; events: RunEvent[] }): ChatTurn[] {
  const turns: ChatTurn[] = [];
  if (workItem) {
    turns.push({
      id: `objective-${workItem.workItemId}`,
      role: "user",
      kind: "message",
      text: workItem.objective,
      meta: formatRelative(workItem.createdAt),
      ts: workItem.createdAt
    });
  }

  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    const turn = chatTurnFromEvent(event);
    if (turn) turns.push(turn);
  }
  return turns;
}

export function chatTurnFromEvent(event: RunEvent): ChatTurn | null {
  const id = event.id || `${event.runId}-${event.seq}-${event.type}`;
  const meta = formatRelative(event.createdAt);
  const payload = recordPayload(event.payload);
  const agentLabel = stringFrom(payload, ["agentName", "agentRole", "delegatedAgentRole", "role"]) || "Agent";

  if (event.type === "assistant.response.final" || event.type === "message.created" || event.type === "agent.message") {
    const text = stringFrom(payload, ["markdown", "text", "message", "content"]);
    if (!text) return null;
    return { id, role: "assistant", kind: "message", text, meta, ts: event.createdAt, actorLabel: agentLabel };
  }

  if (event.type === "run.message") {
    const text = stringFrom(payload, ["markdown", "text", "message", "content"]);
    if (!text) return null;
    const role = stringFrom(payload, ["role"]) === "user" ? "user" : "assistant";
    return { id, role, kind: "message", text, meta, ts: event.createdAt, actorLabel: role === "assistant" ? agentLabel : undefined };
  }

  if (event.type === "artifact.created") {
    const name = stringFrom(payload, ["name"]) || "artifact";
    const kind = stringFrom(payload, ["kind"]) || "artifact";
    const artifactId = stringFrom(payload, ["artifactId"]);
    const uri = stringFrom(payload, ["uri"]);
    const previewUrl = stringFrom(payload, ["previewUrl"]);
    return {
      id,
      role: "assistant",
      kind: "artifact",
      text: `Created ${kind}: ${name}`,
      meta,
      ts: event.createdAt,
      actorLabel: agentLabel,
      artifact: { artifactId, kind, name, uri, previewUrl }
    };
  }

  if (event.type === "agent.delegated") {
    const delegatedRole = stringFrom(payload, ["delegatedAgentRole", "role"]) || "specialist agent";
    const objective = stringFrom(payload, ["objective", "summary"]);
    return {
      id,
      role: "assistant",
      kind: "event",
      text: objective ? `Created ${delegatedRole}: ${objective}` : `Created ${delegatedRole}.`,
      meta,
      ts: event.createdAt,
      actorLabel: agentLabel
    };
  }

  if (event.type === "work.item.created" || event.type === "work_item.created") {
    const title = stringFrom(payload, ["title", "objective", "summary"]) || "new delegated task";
    return { id, role: "assistant", kind: "event", text: `Created task: ${title}`, meta, ts: event.createdAt, actorLabel: agentLabel };
  }

  if (event.type === "work.item.assigned" || event.type === "work_item.assigned") {
    const assignee = stringFrom(payload, ["assignedAgentRole", "delegatedAgentRole", "agentId", "assignee"]) || "agent";
    const title = stringFrom(payload, ["title", "objective", "summary"]);
    return { id, role: "assistant", kind: "event", text: title ? `Assigned ${title} to ${assignee}.` : `Assigned task to ${assignee}.`, meta, ts: event.createdAt, actorLabel: agentLabel };
  }

  if (event.type === "user.notification.requested") {
    const body = stringFrom(payload, ["body", "message", "summary"]) || "Notification requested.";
    return { id, role: "system", kind: "event", text: `Notification requested: ${body}`, meta, ts: event.createdAt };
  }

  if (event.type === "user.call.requested") {
    const summary = stringFrom(payload, ["summary", "body", "message"]) || "Phone call requested.";
    return { id, role: "system", kind: "event", text: `Phone call requested: ${summary}`, meta, ts: event.createdAt };
  }

  if (event.type === "webpage.published") {
    const url = stringFrom(payload, ["url", "previewUrl", "uri"]);
    const title = stringFrom(payload, ["title", "name"]) || "webpage";
    return { id, role: "assistant", kind: "event", text: url ? `Published ${title}: ${url}` : `Published ${title}.`, meta, ts: event.createdAt, actorLabel: agentLabel };
  }

  if (event.type === "client.control.requested" || event.type === "browser.control.requested") {
    const message = stringFrom(payload, ["message", "summary"]);
    const kind = stringFrom(payload, ["kind"]);
    if (!message && !kind) return null;
    return { id, role: "system", kind: "event", text: message || `Client action requested: ${kind}`, meta, ts: event.createdAt };
  }

  if (event.type === "tool.approval" || event.type === "approval.requested") {
    const reason = stringFrom(payload, ["requestedAction", "reason", "summary"]) || "Action paused — approval needed.";
    return { id, role: "system", kind: "approval", text: reason, meta, ts: event.createdAt };
  }

  return null;
}

export function mergeChatEvents(existing: RunEvent[], incoming: RunEvent[]): RunEvent[] {
  const map = new Map<string, RunEvent>();
  for (const e of [...existing, ...incoming]) {
    map.set(e.id || `${e.runId}-${e.seq}-${e.type}`, e);
  }
  return [...map.values()].sort((a, b) => a.seq - b.seq);
}

function recordPayload(payload: RunEvent["payload"]): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function stringFrom(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return "";
}

function formatRelative(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const delta = Date.now() - t;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h`;
  return new Date(iso).toLocaleDateString();
}
