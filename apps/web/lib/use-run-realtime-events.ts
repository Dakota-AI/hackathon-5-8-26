"use client";

import * as React from "react";
import { requireIdToken, type RunEvent } from "./control-api";
import {
  buildRealtimeWebSocketUrl,
  parseRealtimeRunEvent,
  requireRealtimeApiUrl,
  serializeSubscribeRunMessage,
  serializeUnsubscribeRunMessage,
  shouldAcceptRealtimeRunEvent
} from "./realtime-client";

export type UseRunRealtimeEventsInput = {
  workspaceId: string;
  runId?: string | null;
  enabled?: boolean;
  onEvent: (event: RunEvent) => void;
};

export function useRunRealtimeEvents({ workspaceId, runId, enabled = true, onEvent }: UseRunRealtimeEventsInput) {
  const onEventRef = React.useRef(onEvent);

  React.useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  React.useEffect(() => {
    if (!enabled || !runId || typeof window === "undefined") {
      return;
    }

    let closed = false;
    let socket: WebSocket | null = null;
    const subscription = { workspaceId, runId };

    async function connect() {
      try {
        const realtimeUrl = requireRealtimeApiUrl();
        const token = await requireIdToken();
        if (closed) return;

        socket = new WebSocket(buildRealtimeWebSocketUrl(realtimeUrl, token));
        socket.addEventListener("open", () => {
          if (!closed && socket?.readyState === WebSocket.OPEN) {
            socket.send(serializeSubscribeRunMessage(subscription));
          }
        });
        socket.addEventListener("message", (message) => {
          if (closed || typeof message.data !== "string") {
            return;
          }
          const event = parseRealtimeRunEvent(message.data);
          if (!event || !shouldAcceptRealtimeRunEvent(event, subscription)) {
            return;
          }
          onEventRef.current(event);
        });
        socket.addEventListener("error", () => {
          // Existing REST polling remains the reliable fallback for demo runs.
        });
      } catch {
        // Missing auth/realtime config should not break the run UI; REST polling remains active.
      }
    }

    void connect();

    return () => {
      closed = true;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(serializeUnsubscribeRunMessage(subscription));
      }
      socket?.close();
    };
  }, [enabled, runId, workspaceId]);
}
