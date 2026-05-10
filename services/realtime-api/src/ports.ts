export interface RealtimeConnection {
  readonly connectionId: string;
  readonly userId: string;
  readonly email?: string;
  readonly domainName: string;
  readonly stage: string;
  readonly connectedAt: string;
}

export interface SubscribeRunInput {
  readonly connectionId: string;
  readonly workspaceId: string;
  readonly runId: string;
  readonly userId: string;
}

export interface UnsubscribeRunInput {
  readonly connectionId: string;
  readonly workspaceId: string;
  readonly runId: string;
}

export interface RealtimeSubscriptionStore {
  saveConnection(connection: RealtimeConnection): Promise<void>;
  getConnection(connectionId: string): Promise<RealtimeConnection | undefined>;
  deleteConnection(connectionId: string): Promise<void>;
  subscribeRun(input: SubscribeRunInput): Promise<void>;
  unsubscribeRun(input: UnsubscribeRunInput): Promise<void>;
  listConnectionsForRun(workspaceId: string, runId: string): Promise<RealtimeConnection[]>;
}

export interface RealtimeEventRecord {
  readonly eventId?: string;
  readonly userId?: string;
  readonly runId: string;
  readonly workspaceId: string;
  readonly seq: number;
  readonly type: string;
  readonly createdAt: string;
  readonly payload: unknown;
}

export interface RealtimePublisher {
  postToConnection(connectionId: string, payload: unknown): Promise<void>;
}
