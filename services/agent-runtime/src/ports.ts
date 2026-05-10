export interface RuntimeContext {
  readonly runId: string;
  readonly taskId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly objective: string;
  readonly now: () => string;
}

export interface RuntimeEvent {
  readonly seq: number;
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

export interface EventSink {
  putEvent(event: RuntimeEvent): Promise<void>;
  updateRunStatus(status: string): Promise<void>;
  updateTaskStatus(status: string): Promise<void>;
}

export interface ArtifactSink {
  putArtifact(input: {
    readonly key: string;
    readonly body: string;
    readonly contentType: string;
  }): Promise<{ bucket: string; key: string; uri: string }>;
  putArtifactRecord(record: Record<string, unknown>): Promise<void>;
}

export interface HermesRunner {
  run(prompt: string): Promise<{
    readonly summary: string;
    readonly rawOutput: string;
    readonly mode: string;
  }>;
}
