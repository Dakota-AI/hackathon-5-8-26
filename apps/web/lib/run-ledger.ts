export type RunEventLike = {
  id?: string;
  runId: string;
  seq: number;
  type: string;
  createdAt: string;
  source?: string | { kind?: string; name?: string; version?: string };
  payload?: Record<string, unknown>;
};

export type ArtifactCard = {
  id: string;
  name: string;
  kind: string;
  uri?: string;
  previewUrl?: string;
};

export type RunLedgerView = {
  status: string;
  lastSeq: number;
  isTerminal: boolean;
  pollingLabel: string;
  artifacts: ArtifactCard[];
};

const terminalStatuses = new Set(["succeeded", "failed", "cancelled", "timed_out"]);

export function mergeRunEvents(existing: RunEventLike[], incoming: RunEventLike[]): RunEventLike[] {
  const byIdentity = new Map<string, RunEventLike>();

  for (const event of [...existing, ...incoming]) {
    const identity = event.id || `${event.runId}:${event.seq}:${event.type}`;
    byIdentity.set(identity, event);
  }

  return [...byIdentity.values()].sort((left, right) => {
    if (left.seq !== right.seq) {
      return left.seq - right.seq;
    }
    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function deriveRunLedgerView(input: { initialStatus: string; events: RunEventLike[] }): RunLedgerView {
  const status = getLatestRunStatus(input.events) || input.initialStatus;
  const isTerminal = isTerminalRunStatus(status);
  const lastSeq = input.events.reduce((maxSeq, event) => Math.max(maxSeq, event.seq), 0);

  return {
    status,
    lastSeq,
    isTerminal,
    pollingLabel: isTerminal ? terminalPollingLabel(status) : "Polling durable ledger...",
    artifacts: extractArtifactCards(input.events)
  };
}

export function getLatestRunStatus(events: RunEventLike[]): string | null {
  for (const event of [...events].sort((left, right) => right.seq - left.seq)) {
    if (event.type !== "run.status") {
      continue;
    }
    const status = readString(event.payload, "status");
    if (status) {
      return status;
    }
  }
  return null;
}

export function extractArtifactCards(events: RunEventLike[]): ArtifactCard[] {
  return events
    .filter((event) => event.type === "artifact.created")
    .map((event) => {
      const artifactId = readString(event.payload, "artifactId") || readString(event.payload, "id") || event.id || `${event.runId}-${event.seq}`;
      return {
        id: artifactId,
        name: readString(event.payload, "name") || "Generated artifact",
        kind: readString(event.payload, "kind") || readString(event.payload, "type") || "artifact",
        uri: readString(event.payload, "uri") || readString(event.payload, "s3Uri"),
        previewUrl: readString(event.payload, "previewUrl")
      };
    });
}

export function isSmokeWorkerArtifact(artifact: Pick<ArtifactCard, "name" | "kind">): boolean {
  const normalizedName = artifact.name.toLowerCase();
  const normalizedKind = artifact.kind.toLowerCase();
  return normalizedKind === "report" && (normalizedName.includes("hermes worker report") || normalizedName.includes("hermes smoke report"));
}

export function isTerminalRunStatus(status: string): boolean {
  return terminalStatuses.has(status.toLowerCase());
}

export function formatRunEventSource(event: Pick<RunEventLike, "source">): string {
  if (typeof event.source === "string" && event.source.trim().length > 0) {
    return event.source;
  }
  if (event.source && typeof event.source === "object") {
    const name = typeof event.source.name === "string" ? event.source.name.trim() : "";
    const kind = typeof event.source.kind === "string" ? event.source.kind.trim() : "";
    if (name && kind) {
      return `${name} (${kind})`;
    }
    if (name) {
      return name;
    }
    if (kind) {
      return kind;
    }
  }
  return "durable ledger";
}

function terminalPollingLabel(status: string): string {
  if (status === "succeeded") {
    return "Run complete";
  }
  if (status === "failed") {
    return "Run failed";
  }
  if (status === "cancelled") {
    return "Run cancelled";
  }
  return "Run stopped";
}

function readString(payload: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = payload?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
