"use client";

import { Authenticator } from "@aws-amplify/ui-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { readAmplifyEnv } from "../lib/amplify-config";
import { resetAmplifyAuthSession } from "../lib/auth-session-reset";
import {
  createControlApiRun,
  getControlApiHealth,
  getControlApiRun,
  listControlApiRunEvents,
  requireIdToken,
  type CreatedRun,
  type RunEvent
} from "../lib/control-api";
import {
  buildRealtimeWebSocketUrl,
  getRealtimeApiHealth,
  parseRealtimeRunEvent,
  requireRealtimeApiUrl,
  serializeSubscribeRunMessage,
  serializeUnsubscribeRunMessage
} from "../lib/realtime-client";
import { deriveRunLedgerView, isSmokeWorkerArtifact, mergeRunEvents } from "../lib/run-ledger";
import { WorkDashboard } from "./work-dashboard";

const defaultObjective = "";

const friendlyStatusLabels: Record<string, string> = {
  queued: "I’ve got it. I’m setting up the work now.",
  planning: "I’m breaking this into the right steps.",
  running: "I’m working on it now.",
  testing: "I’m checking the result before I show it to you.",
  archiving: "I’m saving the final output.",
  succeeded: "Done — I generated the result.",
  failed: "Something went wrong while doing the work.",
  cancelled: "This run was cancelled."
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  muted?: boolean;
};

export function CommandCenter() {
  if (process.env.NEXT_PUBLIC_AGENTS_CLOUD_DEV_AUTH_BYPASS === "1") {
    return <CommandCenterApp userLabel="Local session" />;
  }

  return (
    <Authenticator variation="modal" hideSignUp={false}>
      {({ user }) => (
        <CommandCenterApp
          userLabel={user?.signInDetails?.loginId || user?.username || "Signed in"}
          onSignOut={() => void resetAmplifyAuthSession({ clientId: readAmplifyEnv().userPoolClientId })}
        />
      )}
    </Authenticator>
  );
}

function CommandCenterApp({ userLabel, onSignOut }: { userLabel: string; onSignOut?: () => void }) {
  const api = getControlApiHealth();

  return (
    <main className="chat-shell">
      <header className="chat-header">
        <div>
          <strong>Agents Cloud</strong>
          <span>Delegate outcomes. Track durable work.</span>
        </div>
        <div className="account-menu">
          <span>{userLabel}</span>
          {onSignOut ? (
            <button type="button" onClick={onSignOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>
      <WorkDashboard />
      <CreateRunPanel apiConfigured={api.configured} mockMode={api.mockMode} />
    </main>
  );
}

function CreateRunPanel({ apiConfigured, mockMode }: { apiConfigured: boolean; mockMode: boolean }) {
  const realtime = getRealtimeApiHealth({ mockMode });
  const [objective, setObjective] = useState(defaultObjective);
  const [submittedObjective, setSubmittedObjective] = useState<string | null>(null);
  const [createdRun, setCreatedRun] = useState<CreatedRun | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const [, setRealtimeState] = useState<"idle" | "connecting" | "live" | "reconnecting" | "closed">("idle");
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const lastSeqRef = useRef(0);

  const ledgerView = useMemo(
    () => deriveRunLedgerView({ initialStatus: createdRun?.status || "queued", events }),
    [createdRun?.status, events]
  );
  const visibleArtifacts = useMemo(
    () => ledgerView.artifacts.filter((artifact) => !isSmokeWorkerArtifact(artifact)),
    [ledgerView.artifacts]
  );

  const messages = useMemo(
    () => buildChatMessages({ objective: submittedObjective, events, submitting, error: error || pollError || realtimeError }),
    [submittedObjective, events, submitting, error, pollError, realtimeError]
  );

  useEffect(() => {
    lastSeqRef.current = ledgerView.lastSeq;
  }, [ledgerView.lastSeq]);

  const refreshLedger = useCallback(
    async (options: { afterSeq?: number; reason?: "poll" | "backfill" } = {}) => {
      if (!createdRun) {
        return;
      }

      try {
        const run = await getControlApiRun(createdRun.runId);
        const nextEvents = await listControlApiRunEvents(createdRun.runId, {
          afterSeq: options.afterSeq ?? lastSeqRef.current,
          limit: 50
        });
        setPollError(null);
        setCreatedRun((current) => (current ? { ...current, status: run.status, executionArn: run.executionArn } : current));
        setEvents((current) => mergeRunEvents(current, nextEvents));
      } catch (err) {
        setPollError(err instanceof Error ? err.message : "Unable to refresh the conversation.");
      }
    },
    [createdRun?.runId]
  );

  useEffect(() => {
    if (!createdRun || ledgerView.isTerminal) {
      return undefined;
    }

    const intervalMs = realtime.configured ? 7500 : mockMode ? 550 : 1800;
    void refreshLedger({ reason: realtime.configured ? "backfill" : "poll" });
    const intervalId = window.setInterval(() => void refreshLedger({ reason: realtime.configured ? "backfill" : "poll" }), intervalMs);
    return () => window.clearInterval(intervalId);
  }, [createdRun?.runId, ledgerView.isTerminal, mockMode, realtime.configured, refreshLedger]);

  useEffect(() => {
    if (!createdRun || ledgerView.isTerminal || !realtime.configured) {
      if (!createdRun) {
        setRealtimeState("idle");
      } else if (ledgerView.isTerminal && realtime.configured) {
        setRealtimeState("closed");
      }
      return undefined;
    }

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    const subscription = { workspaceId: createdRun.workspaceId, runId: createdRun.runId };

    async function connect() {
      setRealtimeState((current) => (current === "live" ? "reconnecting" : "connecting"));
      try {
        const token = await requireIdToken();
        if (cancelled) {
          return;
        }
        socket = new WebSocket(buildRealtimeWebSocketUrl(requireRealtimeApiUrl(), token));
      } catch (err) {
        if (!cancelled) {
          setRealtimeError(err instanceof Error ? err.message : "Unable to start live updates.");
          setRealtimeState("reconnecting");
          reconnectTimer = window.setTimeout(connect, 3000);
        }
        return;
      }

      socket.addEventListener("open", () => {
        if (cancelled || !socket) {
          return;
        }
        setRealtimeError(null);
        setRealtimeState("live");
        socket.send(serializeSubscribeRunMessage(subscription));
        void refreshLedger({ reason: "backfill" });
      });

      socket.addEventListener("message", (message) => {
        const realtimeEvent = parseRealtimeRunEvent(String(message.data));
        if (!realtimeEvent || realtimeEvent.runId !== subscription.runId) {
          return;
        }
        setEvents((current) => mergeRunEvents(current, [realtimeEvent]));
      });

      socket.addEventListener("close", () => {
        if (cancelled || ledgerView.isTerminal) {
          return;
        }
        setRealtimeState("reconnecting");
        void refreshLedger({ reason: "backfill" });
        reconnectTimer = window.setTimeout(connect, 1600);
      });

      socket.addEventListener("error", () => {
        if (!cancelled) {
          setRealtimeError("Live updates paused; I’m checking the saved conversation instead.");
        }
      });
    }

    void connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(serializeUnsubscribeRunMessage(subscription));
      }
      socket?.close();
    };
  }, [createdRun?.runId, createdRun?.workspaceId, ledgerView.isTerminal, realtime.configured, refreshLedger]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedObjective = objective.trim();
    if (trimmedObjective.length < 2) {
      return;
    }

    setError(null);
    setPollError(null);
    setRealtimeError(null);
    setRealtimeState("idle");
    setCreatedRun(null);
    setEvents([]);
    setSubmittedObjective(trimmedObjective);
    setSubmitting(true);

    try {
      const run = await createControlApiRun({
        workspaceId: "workspace-web",
        objective: trimmedObjective
      });
      setCreatedRun(run);
      setEvents(await listControlApiRunEvents(run.runId, { limit: 50 }));
      setObjective("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start the work.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="chat-product" aria-label="Agents Cloud chat">
      <div className="conversation-card">
        <div className="message-list" aria-live="polite">
          {messages.length ? (
            messages.map((message) => <ChatBubble key={message.id} message={message} />)
          ) : (
            <div className="empty-state">
              <strong>What should we work on?</strong>
              <p>Ask for a report, a prototype, research, a plan, or a generated UI draft.</p>
            </div>
          )}
          {visibleArtifacts.length ? (
            <div className="generated-ui-stack" aria-label="Generated UI">
              {visibleArtifacts.map((artifact) => (
                <article className="generated-card" key={artifact.id}>
                  <span>Generated output</span>
                  <strong>{artifact.name}</strong>
                  <p>Ready to review.</p>
                </article>
              ))}
            </div>
          ) : null}
        </div>

        <form className="composer" onSubmit={onSubmit}>
          <textarea
            aria-label="Message Agents Cloud"
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Message Agents Cloud..."
            rows={1}
          />
          <button className="send-button" type="submit" disabled={!apiConfigured || submitting || objective.trim().length < 2}>
            {submitting ? "…" : "↑"}
          </button>
          <button className="call-button" type="button" aria-label="Start voice call" title="Voice call prototype next">
            ☎
          </button>
        </form>
      </div>

    </section>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  return (
    <article className={`chat-bubble ${message.role} ${message.muted ? "muted" : ""}`}>
      <p>{message.text}</p>
    </article>
  );
}

function buildChatMessages(input: {
  objective: string | null;
  events: RunEvent[];
  submitting: boolean;
  error: string | null;
}): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const artifacts = deriveRunLedgerView({ initialStatus: "queued", events: input.events }).artifacts;
  const hasSmokeWorkerArtifact = artifacts.some((artifact) => isSmokeWorkerArtifact(artifact));
  if (input.objective) {
    messages.push({ id: "user-objective", role: "user", text: input.objective });
  }
  if (input.submitting) {
    messages.push({ id: "assistant-starting", role: "assistant", text: "I’m starting that now." });
  }

  const seen = new Set<string>();
  for (const event of input.events) {
    const message = friendlyMessageForEvent(event, { hasSmokeWorkerArtifact });
    if (!message || seen.has(message)) {
      continue;
    }
    seen.add(message);
    messages.push({ id: event.id || `${event.runId}-${event.seq}-${event.type}`, role: "assistant", text: message });
  }

  if (input.error) {
    messages.push({ id: "system-error", role: "system", text: input.error, muted: true });
  }

  return messages;
}

function friendlyMessageForEvent(event: RunEvent, context: { hasSmokeWorkerArtifact: boolean }): string | null {
  if (event.type === "run.status" && typeof event.payload?.status === "string") {
    if (event.payload.status === "succeeded" && context.hasSmokeWorkerArtifact) {
      return "The request reached the worker successfully, but the deployed worker is still only a test runner. It did not build the web app yet.";
    }
    return friendlyStatusLabels[event.payload.status] || "I’m updating the work status.";
  }
  if (event.type === "artifact.created") {
    const name = typeof event.payload?.name === "string" ? event.payload.name : "the result";
    const kind = typeof event.payload?.kind === "string" ? event.payload.kind : "artifact";
    if (isSmokeWorkerArtifact({ name, kind })) {
      return "This produced a worker test report, not the requested app. The next step is connecting the real app-generation/local LLM worker.";
    }
    return `I created ${name}.`;
  }
  return null;
}


