"use client";

import * as React from "react";
import { GlobeIcon, PaperPlaneIcon, ReaderIcon } from "@radix-ui/react-icons";
import {
  createControlApiRun,
  createControlApiWorkItem,
  getControlApiHealth,
  getControlApiRun,
  listControlApiRunEvents,
  type CreatedRun,
  type RunEvent
} from "../../lib/control-api";
import { useWorkspace } from "../workspace-context";
import { deriveRunLedgerView, isSmokeWorkerArtifact, mergeRunEvents } from "../../lib/run-ledger";
import { useAuth } from "../auth-context";
import { Panel } from "./panel";
import { StatusPill } from "./status-pill";
import { Textarea } from "./textarea";
import { Button } from "./button";
import { ChatBubble } from "./chat-bubble";

const friendlyStatusLabels: Record<string, string> = {
  queued: "Got it. Setting up the work now.",
  planning: "Breaking this into the right steps.",
  running: "Working on it.",
  testing: "Checking the result before showing it.",
  archiving: "Saving the final output.",
  succeeded: "Done — the result is ready.",
  failed: "Something went wrong while doing the work.",
  cancelled: "This run was cancelled."
};

const placeholder =
  "Describe the strategic objective — research a market, build a launch page, prepare a CEO report…";

export function HeroCommandPanel() {
  const { isAuthed, openSignIn } = useAuth();
  const { workspaceId } = useWorkspace();
  const api = getControlApiHealth();
  const [objective, setObjective] = React.useState("");
  const [submittedObjective, setSubmittedObjective] = React.useState<string | null>(null);
  const [createdRun, setCreatedRun] = React.useState<CreatedRun | null>(null);
  const [events, setEvents] = React.useState<RunEvent[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const lastSeqRef = React.useRef(0);

  const ledger = React.useMemo(
    () => deriveRunLedgerView({ initialStatus: createdRun?.status || "queued", events }),
    [createdRun?.status, events]
  );

  React.useEffect(() => {
    lastSeqRef.current = ledger.lastSeq;
  }, [ledger.lastSeq]);

  React.useEffect(() => {
    if (!createdRun || ledger.isTerminal) return;
    const intervalMs = 2000;
    const tick = async () => {
      try {
        const run = await getControlApiRun(createdRun.runId);
        const next = await listControlApiRunEvents(createdRun.runId, {
          afterSeq: lastSeqRef.current,
          limit: 50
        });
        setCreatedRun((c) => (c ? { ...c, status: run.status, executionArn: run.executionArn } : c));
        setEvents((c) => mergeRunEvents(c, next));
      } catch {
        // ignore polling errors
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => window.clearInterval(id);
  }, [createdRun?.runId, ledger.isTerminal]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthed) {
      openSignIn();
      return;
    }
    const trimmed = objective.trim();
    if (trimmed.length < 2) return;

    setError(null);
    setSubmitting(true);
    setEvents([]);
    setCreatedRun(null);
    setSubmittedObjective(trimmed);

    try {
      // Create a WorkItem (durable container) and start an immediate run from it.
      // Falls back to a direct run if workitem creation isn't available.
      try {
        await createControlApiWorkItem({ workspaceId, objective: trimmed });
      } catch {
        /* not fatal — still try to create a run below */
      }
      const run = await createControlApiRun({ workspaceId, objective: trimmed });
      setCreatedRun(run);
      const initial = await listControlApiRunEvents(run.runId, { limit: 50 });
      setEvents(initial);
      setObjective("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the run.");
    } finally {
      setSubmitting(false);
    }
  }

  const messages = buildMessages({ objective: submittedObjective, events, submitting, error });

  const heroLeftPills: { label: string; tone: "accent" | "success" | "info" }[] = [
    { label: "Autonomous control plane", tone: "accent" },
    { label: "CEO workflow", tone: "success" },
    { label: "Markdown + GenUI", tone: "info" }
  ];

  return (
    <Panel padding={16}>
      <div className="flex flex-wrap gap-1.5">
        {heroLeftPills.map((pill) => (
          <StatusPill key={pill.label} {...pill} />
        ))}
      </div>
      <h1 className="mt-3.5 text-[26px] md:text-[28px] font-black leading-[1.04] tracking-[-0.5px] text-app-text">
        Command the company. Track every run.
      </h1>
      <p className="mt-2.5 text-[13px] md:text-sm leading-[1.4] text-app-muted max-w-[680px]">
        A workflow-first command surface for objectives, streamed reasoning, approvals, generated UI, and
        durable artifacts.
      </p>

      <form onSubmit={onSubmit} className="mt-3.5 flex flex-col gap-2.5">
        <Textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder={placeholder}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          disabled={submitting}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || (isAuthed && !api.configured)}
          >
            <PaperPlaneIcon />
            {!isAuthed ? "Sign in to start" : submitting ? "Starting…" : "Create run"}
          </Button>
          <Button type="button" variant="outline" disabled>
            <ReaderIcon />
            Draft report
          </Button>
          <Button type="button" variant="outline" disabled>
            <GlobeIcon />
            Preview site
          </Button>
          {!api.configured ? (
            <StatusPill label="Control API not configured" tone="warning" />
          ) : !isAuthed ? (
            <StatusPill label="Sign in to enable" tone="warning" />
          ) : (
            <StatusPill label="Control API live" tone="success" />
          )}
        </div>
      </form>

      {error ? (
        <div className="mt-3 rounded-[10px] border border-[#7F1D1D]/60 bg-[#7F1D1D]/10 p-3 text-[12px] text-[#ff8f8f]">
          {error}
        </div>
      ) : null}

      {messages.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-app-border pt-3.5">
          <div className="text-[12px] font-extrabold text-app-text">Live conversation</div>
          {messages.map((m) => (
            <ChatBubble
              key={m.id}
              role={m.role === "user" ? "You" : m.role === "assistant" ? "Executive agent" : "System"}
              body={m.text}
              alignRight={m.role === "user"}
            />
          ))}
          {createdRun && !ledger.isTerminal ? (
            <div className="text-[11px] text-app-muted">
              {ledger.pollingLabel} · run {createdRun.runId.slice(-8)}
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

type Msg = { id: string; role: "user" | "assistant" | "system"; text: string };

function buildMessages(input: {
  objective: string | null;
  events: RunEvent[];
  submitting: boolean;
  error: string | null;
}): Msg[] {
  const out: Msg[] = [];
  const artifacts = deriveRunLedgerView({ initialStatus: "queued", events: input.events }).artifacts;
  const hasSmoke = artifacts.some((a) => isSmokeWorkerArtifact(a));
  if (input.objective) out.push({ id: "user-objective", role: "user", text: input.objective });
  if (input.submitting) out.push({ id: "starting", role: "assistant", text: "Starting that now." });

  const seen = new Set<string>();
  for (const event of input.events) {
    const text = friendlyEvent(event, hasSmoke);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({
      id: event.id || `${event.runId}-${event.seq}-${event.type}`,
      role: "assistant",
      text
    });
  }
  return out;
}

function friendlyEvent(event: RunEvent, hasSmoke: boolean): string | null {
  if (event.type === "run.status" && typeof event.payload?.status === "string") {
    if (event.payload.status === "succeeded" && hasSmoke) {
      return "Reached the worker, but the deployed worker is still a test runner. Real app generation isn't wired yet.";
    }
    return friendlyStatusLabels[event.payload.status] ?? "Updating the work status.";
  }
  if (event.type === "artifact.created") {
    const name = typeof event.payload?.name === "string" ? event.payload.name : "the result";
    const kind = typeof event.payload?.kind === "string" ? event.payload.kind : "artifact";
    if (isSmokeWorkerArtifact({ name, kind })) {
      return "This produced a worker test report, not the requested app.";
    }
    return `Created ${name}.`;
  }
  return null;
}
