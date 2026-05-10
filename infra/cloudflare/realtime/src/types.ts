export interface Env {
  USER_HUBS: DurableObjectNamespace;
  WORKSPACE_HUBS: DurableObjectNamespace;
  SESSION_HUBS: DurableObjectNamespace;
  COGNITO_JWKS_URL: string;
  COGNITO_ISS: string;
  COGNITO_AUD: string;
  RELAY_SHARED_SECRET: string;
  LOG_LEVEL: string;
}

export interface AuthenticatedUser {
  userId: string;
  email?: string;
  exp?: number;
}

export interface RealtimeEvent {
  eventId: string;
  runId: string;
  workspaceId: string;
  seq: number;
  type: string;
  payload?: unknown;
  createdAt: string;
}

export interface ClientSocketAttachment {
  userId: string;
  email?: string;
  workspaceId: string;
  runId?: string;
  client: ClientKind;
  connectedAt: string;
}

export type ClientKind = "web" | "desktop" | "mobile";

export interface ClientMessage {
  type: string;
  eventId?: string;
  runId?: string;
  workspaceId?: string;
  payload?: unknown;
}

export interface HealthResponse {
  status: "healthy";
  service: "agents-cloud-realtime";
  version: string;
  timestamp: string;
}
