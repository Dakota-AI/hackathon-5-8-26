import type { RunEvent } from "./control-api";

export type AdminLineageStep = {
  seq: number;
  type: string;
  createdAt: string;
  source: string;
  summary: string;
  status?: string;
  hasError: boolean;
};

export function describeAdminLineageEvent(event: RunEvent): AdminLineageStep {
  const status = stringPayload(event, "status");
  const errorMessage = extractErrorMessage(event.payload?.error);
  const artifactName = stringPayload(event, "name") || stringPayload(event, "artifactId");
  const artifactKind = stringPayload(event, "kind");

  return {
    seq: event.seq,
    type: event.type,
    createdAt: event.createdAt,
    source: formatEventSource(event),
    status,
    hasError: Boolean(errorMessage || status === "failed"),
    summary: summarizeEvent(event.type, status, errorMessage, artifactName, artifactKind)
  };
}

export function summarizePipelinePosition(events: RunEvent[]): string {
  const ordered = [...events].sort((left, right) => left.seq - right.seq);
  const failed = ordered.find((event) => stringPayload(event, "status") === "failed" || event.payload?.error !== undefined);
  if (failed) {
    return `Failed at ${failed.type}: ${extractErrorMessage(failed.payload?.error) || "see event payload"}`;
  }

  const latestStatus = [...ordered].reverse().find((event) => event.type === "run.status");
  const status = latestStatus ? stringPayload(latestStatus, "status") : undefined;
  if (status === "queued") {
    return "Currently queued after Control API acceptance. If it stalls here, inspect Step Functions start/execution creation.";
  }
  if (status === "running" || status === "planning" || status === "testing" || status === "archiving") {
    return "Currently in worker execution. If it stalls here, inspect Step Functions/ECS worker logs.";
  }
  if (status === "succeeded") {
    return "Pipeline reached terminal success. If output is wrong, inspect artifact and worker payload events.";
  }
  if (ordered.some((event) => event.type === "artifact.created")) {
    return "Artifact was produced. Inspect following status events to confirm archive/completion.";
  }
  return "No pipeline events loaded yet.";
}

function summarizeEvent(type: string, status?: string, errorMessage?: string, artifactName?: string, artifactKind?: string): string {
  if (errorMessage || status === "failed") {
    return `Run failed: ${errorMessage || "see event payload"}`;
  }
  if (type === "run.status") {
    if (status === "queued") {
      return "Request accepted by Control API and queued.";
    }
    if (status === "running") {
      return "Worker execution started or reported running.";
    }
    if (status === "succeeded") {
      return "Run completed successfully.";
    }
    if (status) {
      return `Run status changed to ${status}.`;
    }
  }
  if (type === "artifact.created") {
    return `Artifact created: ${artifactName || "unnamed artifact"}${artifactKind ? ` (${artifactKind})` : ""}.`;
  }
  return `${type} event recorded.`;
}

function stringPayload(event: RunEvent, key: string): string | undefined {
  const value = event.payload?.[key];
  return typeof value === "string" ? value : undefined;
}

function formatEventSource(event: RunEvent): string {
  if (typeof event.source === "string") {
    return event.source;
  }
  if (event.source?.name && event.source.kind) {
    return `${event.source.name} (${event.source.kind})`;
  }
  return event.source?.name || event.source?.kind || "durable ledger";
}

function extractErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const message = (value as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
}
