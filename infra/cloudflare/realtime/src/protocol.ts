import type { RealtimeEvent } from "./types.js";

export function buildRealtimeEvent(input: RealtimeEvent): RealtimeEvent {
  return parseRealtimeEvent(input);
}

export function parseRealtimeEvent(value: unknown): RealtimeEvent {
  if (!isRecord(value)) {
    throw new Error("event must be an object");
  }

  const eventId = requiredString(value.eventId, "eventId");
  const runId = requiredString(value.runId, "runId");
  const workspaceId = requiredString(value.workspaceId, "workspaceId");
  const type = requiredString(value.type, "type");
  const createdAt = requiredString(value.createdAt, "createdAt");
  const seq = value.seq;

  if (!Number.isInteger(seq) || (seq as number) <= 0) {
    throw new Error("seq must be a positive integer");
  }

  return {
    eventId,
    runId,
    workspaceId,
    seq: seq as number,
    type,
    payload: value.payload,
    createdAt
  };
}

export function serializeEvent(event: RealtimeEvent): string {
  return JSON.stringify({
    event_type: "run_event",
    event
  });
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
