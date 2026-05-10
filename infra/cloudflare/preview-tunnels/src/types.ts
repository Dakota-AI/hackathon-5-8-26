export interface Env {
  readonly TUNNEL_SESSIONS: DurableObjectNamespace;
  readonly TUNNEL_REGISTRY: KVNamespace;
  readonly BASE_DOMAIN: string;
  readonly HOST_PREFIX?: string;
  readonly DEFAULT_TTL_MINUTES?: string;
  readonly MAX_TTL_MINUTES?: string;
  readonly MAX_TUNNELS_PER_RUN?: string;
  readonly LOG_LEVEL?: string;
  readonly PREVIEW_API_TOKEN?: string;
  readonly TUNNEL_JWT_SECRET: string;
}

export interface CreateTunnelRequest {
  readonly workspaceId?: string;
  readonly runId?: string;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly label?: string;
  readonly port?: number;
  readonly ttlMinutes?: number;
}

export interface TunnelMetadata {
  readonly tunnelId: string;
  readonly previewHost: string;
  readonly previewUrl: string;
  readonly workspaceId?: string;
  readonly runId?: string;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly label?: string;
  readonly port: number;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly status: "created" | "connected" | "disconnected" | "deleted";
}

export interface CreateTunnelResponse {
  readonly tunnelId: string;
  readonly previewHost: string;
  readonly previewUrl: string;
  readonly connectUrl: string;
  readonly tunnelToken: string;
  readonly expiresAt: string;
}

export interface TunnelClaims {
  readonly sub: string;
  readonly workspaceId?: string;
  readonly runId?: string;
  readonly tunnelId: string;
  readonly previewHost: string;
  readonly allowedPort: number;
  readonly exp: number;
  readonly iat: number;
}

export interface Frame {
  readonly type: string;
  readonly stream_id?: number;
  readonly method?: string;
  readonly path?: string;
  readonly query?: string;
  readonly headers?: Record<string, string>;
  readonly status?: number;
  readonly chunk_b64?: string;
  readonly last?: boolean;
  readonly message?: string;
  readonly code?: string;
}

export interface PendingStream {
  readonly id: number;
  readonly resolve: (response: Response) => void;
  readonly reject: (error: Error) => void;
  readonly chunks: Uint8Array[];
  timeout?: ReturnType<typeof setTimeout>;
  status?: number;
  headers?: Headers;
}

export interface DesktopAttachment {
  readonly type: "runner";
  readonly tunnelId: string;
  readonly previewHost: string;
  readonly expiresAt: number;
}
