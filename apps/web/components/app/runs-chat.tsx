"use client";

import * as React from "react";
import {
  ChatBubbleIcon,
  GearIcon,
  PaperPlaneIcon,
  PlusIcon,
  ReloadIcon,
  TrashIcon
} from "@radix-ui/react-icons";
import {
  createControlApiWorkItem,
  getControlApiHealth,
  listControlApiRunEvents,
  listControlApiWorkItemEvents,
  listControlApiWorkItemRuns,
  listControlApiWorkItems,
  startControlApiWorkItemRun,
  type RunEvent,
  type WorkItemRecord,
  type WorkItemRunRecord
} from "../../lib/control-api";
import { buildChatTurns, mergeChatEvents, type ChatTurn } from "../../lib/chat-events";
import { readRealtimeStatus } from "../../lib/realtime-client";
import { useRunRealtimeEvents } from "../../lib/use-run-realtime-events";
import { useAuth } from "../auth-context";
import { useWorkspace } from "../workspace-context";
import { cn } from "../../lib/utils";
import { MarkdownMessage } from "./markdown-message";
import { Panel } from "./panel";
import { StatusPill } from "./status-pill";
import { Textarea } from "./textarea";
import { Button } from "./button";
import { LogoMark } from "./logo-mark";

export function RunsChat() {
  const { isAuthed, openSignIn, userLabel } = useAuth();
  const { workspaceId } = useWorkspace();
  const api = getControlApiHealth();

  const [items, setItems] = React.useState<WorkItemRecord[]>([]);
  const [loadingItems, setLoadingItems] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [refreshTick, setRefreshTick] = React.useState(0);

  const loadItems = React.useCallback(async () => {
    if (!isAuthed || !api.configured) return;
    setLoadingItems(true);
    setError(null);
    try {
      const r = await listControlApiWorkItems({ workspaceId, limit: 50 });
      setItems(r.workItems);
      setSelectedId((cur) => cur ?? r.workItems[0]?.workItemId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load conversations.");
    } finally {
      setLoadingItems(false);
    }
  }, [isAuthed, api.configured, workspaceId]);

  React.useEffect(() => {
    void loadItems();
  }, [loadItems, refreshTick]);

  return (
    <div className="flex h-[calc(100vh-54px)] md:h-[calc(100vh-54px)] max-md:h-[calc(100vh-48px-58px-1px)]">
      <Sidebar
        items={items}
        loading={loadingItems}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onRefresh={() => setRefreshTick((n) => n + 1)}
        onCreated={(item) => {
          setItems((cur) => [item, ...cur.filter((i) => i.workItemId !== item.workItemId)]);
          setSelectedId(item.workItemId);
        }}
      />
      <div className="flex flex-1 min-w-0 flex-col">
        {!isAuthed ? (
          <SignedOutHero onSignIn={openSignIn} />
        ) : !api.configured ? (
          <CenteredMessage title="Control API not configured" subtitle="Set NEXT_PUBLIC_AGENTS_CLOUD_API_URL." />
        ) : (
          <>
            <MobileConversationControls
              items={items}
              loading={loadingItems}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onRefresh={() => setRefreshTick((n) => n + 1)}
              onCreated={(item) => {
                setItems((cur) => [item, ...cur.filter((i) => i.workItemId !== item.workItemId)]);
                setSelectedId(item.workItemId);
              }}
            />
            {!selectedId ? (
              <EmptyChat onRefresh={() => setRefreshTick((n) => n + 1)} />
            ) : (
              <Conversation
                key={selectedId}
                workspaceId={workspaceId}
                workItem={items.find((i) => i.workItemId === selectedId) ?? null}
                userLabel={userLabel}
              />
            )}
          </>
        )}
        {error ? (
          <div className="border-t border-app-border bg-[#7F1D1D]/15 px-4 py-2 text-[12px] text-[#ff8f8f]">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Sidebar({
  items,
  loading,
  selectedId,
  onSelect,
  onRefresh,
  onCreated
}: {
  items: WorkItemRecord[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onCreated: (item: WorkItemRecord) => void;
}) {
  const { isAuthed } = useAuth();
  const { workspaceId } = useWorkspace();
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const objective = draft.trim();
    if (!isAuthed || objective.length < 2) return;
    setCreating(true);
    setError(null);
    try {
      const r = await createControlApiWorkItem({ workspaceId, objective });
      setDraft("");
      onCreated(r.workItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create conversation.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside className="hidden md:flex w-[280px] shrink-0 flex-col border-r border-app-border bg-app-sidebar">
      <div className="px-3 pt-3 pb-2">
        <NewConversationForm
          draft={draft}
          creating={creating}
          disabled={!isAuthed}
          onDraftChange={setDraft}
          onSubmit={onCreate}
          refreshButton={
            <Button type="button" variant="ghost" size="sm" onClick={onRefresh} aria-label="Refresh conversations">
              <ReloadIcon className={cn(loading && "animate-spin")} />
            </Button>
          }
        />
        {error ? <div className="mt-2 text-[11px] text-[#ff8f8f]">{error}</div> : null}
      </div>
      <div className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-wider text-app-muted">
        Conversations
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading && items.length === 0 ? (
          <div className="px-2 py-3 text-[12px] text-app-muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-2 py-3 text-[12px] text-app-muted">No conversations yet.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {items.map((item) => (
              <button
                key={item.workItemId}
                type="button"
                onClick={() => onSelect(item.workItemId)}
                className={cn(
                  "rounded-[8px] px-2.5 py-2 text-left transition-colors",
                  item.workItemId === selectedId
                    ? "bg-app-input text-app-text"
                    : "text-app-muted hover:bg-app-input/60 hover:text-app-text"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <ChatBubbleIcon className="h-3 w-3 shrink-0" />
                  <div className="min-w-0 flex-1 text-[12px] font-bold truncate">
                    {item.title || item.objective}
                  </div>
                </div>
                <div className="mt-1 ml-4 text-[10px] text-app-muted truncate">
                  {item.status} · {formatRelative(item.updatedAt || item.createdAt)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function MobileConversationControls({
  items,
  loading,
  selectedId,
  onSelect,
  onRefresh,
  onCreated
}: {
  items: WorkItemRecord[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onCreated: (item: WorkItemRecord) => void;
}) {
  const { workspaceId } = useWorkspace();
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const objective = draft.trim();
    if (objective.length < 2) return;
    setCreating(true);
    setError(null);
    try {
      const r = await createControlApiWorkItem({ workspaceId, objective });
      setDraft("");
      onCreated(r.workItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create conversation.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="border-b border-app-border bg-app-sidebar px-3 py-2 md:hidden">
      <div className="flex items-center gap-2">
        <select
          value={selectedId ?? ""}
          onChange={(e) => {
            if (e.target.value) onSelect(e.target.value);
          }}
          className="min-w-0 flex-1 rounded-[8px] border border-app-border bg-app-input px-2 py-2 text-[12px] text-app-text focus:outline-none focus:border-app-text/40"
          aria-label="Select conversation"
        >
          <option value="">{loading ? "Loading conversations..." : "Select conversation"}</option>
          {items.map((item) => (
            <option key={item.workItemId} value={item.workItemId}>
              {item.title || item.objective}
            </option>
          ))}
        </select>
        <Button type="button" variant="ghost" size="icon" onClick={onRefresh} aria-label="Refresh conversations">
          <ReloadIcon className={cn(loading && "animate-spin")} />
        </Button>
      </div>
      <div className="mt-2">
        <NewConversationForm
          draft={draft}
          creating={creating}
          onDraftChange={setDraft}
          onSubmit={onCreate}
          compact
        />
      </div>
      {error ? <div className="mt-2 text-[11px] text-[#ff8f8f]">{error}</div> : null}
    </div>
  );
}

function NewConversationForm({
  draft,
  creating,
  disabled,
  onDraftChange,
  onSubmit,
  refreshButton,
  compact
}: {
  draft: string;
  creating: boolean;
  disabled?: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  refreshButton?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className={cn("flex gap-2", compact ? "items-center" : "flex-col")}>
      <input
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        placeholder="New conversation..."
        className="min-w-0 flex-1 rounded-[8px] border border-app-border bg-app-input px-2.5 py-2 text-[12px] text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-text/40"
      />
      <div className="flex shrink-0 items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={creating || disabled}>
          <PlusIcon /> {creating ? "Creating..." : "Start"}
        </Button>
        {refreshButton}
      </div>
    </form>
  );
}

function SignedOutHero({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="text-center max-w-[460px]">
        <LogoMark size="lg" className="mx-auto" />
        <div className="mt-4 text-[24px] font-black tracking-[-0.02em] text-app-text">
          Talk to your team.
        </div>
        <p className="mt-2 text-[13px] leading-[1.5] text-app-muted">
          Sign in to delegate outcomes, track every run, and see live agent reasoning. Your
          conversations sync to durable AWS storage.
        </p>
        <Button variant="primary" size="lg" className="mt-4" onClick={onSignIn}>
          Sign in to start
        </Button>
      </div>
    </div>
  );
}

function CenteredMessage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="text-center max-w-[460px]">
        <div className="text-sm font-extrabold text-app-text">{title}</div>
        <p className="mt-2 text-[13px] text-app-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyChat({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="text-center max-w-[460px]">
        <LogoMark size="lg" className="mx-auto" />
        <div className="mt-4 text-[20px] font-black tracking-[-0.02em] text-app-text">
          Pick a conversation
        </div>
        <p className="mt-2 text-[13px] text-app-muted">
          Start a new objective in the sidebar or refresh to load existing work.
        </p>
        <Button variant="outline" size="md" className="mt-3" onClick={onRefresh}>
          <ReloadIcon /> Refresh
        </Button>
      </div>
    </div>
  );
}

function Conversation({
  workspaceId,
  workItem,
  userLabel
}: {
  workspaceId: string;
  workItem: WorkItemRecord | null;
  userLabel: string | null;
}) {
  const [runs, setRuns] = React.useState<WorkItemRunRecord[]>([]);
  const [events, setEvents] = React.useState<RunEvent[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sessionCutoffMs, setSessionCutoffMs] = React.useState<number | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const activeRun = React.useMemo(() => runs.find((r) => !isTerminal(r.status)) ?? null, [runs]);

  const handleRealtimeEvent = React.useCallback((event: RunEvent) => {
    setEvents((cur) => mergeChatEvents(cur, [event]));
    const status = readRealtimeStatus(event);
    if (status) {
      setRuns((cur) => cur.map((run) => (run.runId === event.runId ? { ...run, status } : run)));
    }
  }, []);

  useRunRealtimeEvents({
    workspaceId,
    runId: activeRun?.runId,
    enabled: Boolean(workItem && activeRun),
    onEvent: handleRealtimeEvent
  });

  const refresh = React.useCallback(async () => {
    if (!workItem) return;
    setLoading(true);
    setError(null);
    try {
      const [runsR, eventsR] = await Promise.all([
        listControlApiWorkItemRuns({ workspaceId, workItemId: workItem.workItemId }).catch(() => ({
          runs: []
        })),
        listControlApiWorkItemEvents({ workspaceId, workItemId: workItem.workItemId, limit: 200 }).catch(
          () => ({ events: [] })
        )
      ]);
      setRuns(runsR.runs);
      setEvents(eventsR.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load conversation.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, workItem]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll the active run's events as a fallback for reconnect gaps or missing WebSocket config.
  React.useEffect(() => {
    if (!workItem || !activeRun) return;
    const id = window.setInterval(async () => {
      try {
        const r = await listControlApiRunEvents(activeRun.runId, { limit: 50 });
        if (r.length > 0) {
          setEvents((cur) => mergeChatEvents(cur, r));
        }
      } catch {
        /* ignore */
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [activeRun?.runId, workItem]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const visibleEvents = React.useMemo(() => {
    if (!sessionCutoffMs) return events;
    return events.filter((event) => {
      const t = Date.parse(event.createdAt ?? "");
      if (Number.isNaN(t)) return true;
      return t >= sessionCutoffMs;
    });
  }, [events, sessionCutoffMs]);
  const turns = React.useMemo(
    () => buildChatTurns({ workItem, events: visibleEvents }),
    [workItem, visibleEvents],
  );
  const showWorkingIndicator = Boolean(activeRun) || submitting;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!workItem) return;
    const objective = draft.trim();
    if (objective.length < 2) return;
    setSubmitting(true);
    setError(null);
    try {
      await startControlApiWorkItemRun({
        workspaceId,
        workItemId: workItem.workItemId,
        objective
      });
      setDraft("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setSubmitting(false);
    }
  }

  function clearConversationHistory() {
    setSessionCutoffMs(Date.now());
  }

  if (!workItem) return null;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-app-border px-4 py-3">
        <div className="min-w-0">
          <div className="text-[14px] font-extrabold text-app-text truncate">
            {workItem.title || workItem.objective}
          </div>
          <div className="mt-0.5 text-[11px] text-app-muted truncate">
            {workItem.objective} · status {workItem.status}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill label={`${runs.length} runs`} tone="info" />
          <StatusPill label={`${events.length} events`} tone="info" />
          <Button variant="ghost" size="icon" onClick={clearConversationHistory} title="Clear history">
            <TrashIcon />
          </Button>
          <Button variant="ghost" size="icon" onClick={refresh} title="Refresh">
            <ReloadIcon className={cn(loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-4">
          {turns.length === 0 ? (
            <div className="text-center text-app-muted text-[12px] py-8">
              Send a message to start real work with this agent team.
            </div>
          ) : (
            turns.map((t) => <Turn key={t.id} turn={t} userLabel={userLabel} />)
          )}
          {showWorkingIndicator ? <WorkingIndicator label={submitting ? "Sending…" : "Agent is working…"} /> : null}
        </div>
      </div>

      <form onSubmit={onSubmit} className="border-t border-app-border bg-app-bg px-4 py-3">
        <div className="mx-auto flex max-w-[820px] items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            placeholder="Send a follow-up to the agent team — Shift+Enter for newline"
            className="min-h-[44px]"
          />
          <Button type="submit" variant="primary" size="lg" disabled={submitting}>
            <PaperPlaneIcon /> {submitting ? "Sending" : "Send"}
          </Button>
        </div>
        {error ? (
          <div className="mx-auto mt-2 max-w-[820px] text-[12px] text-[#ff8f8f]">{error}</div>
        ) : null}
      </form>
    </div>
  );
}

function Turn({ turn, userLabel }: { turn: ChatTurn; userLabel: string | null }) {
  const isUser = turn.role === "user";
  const isTool = turn.role === "tool";
  const isSystem = turn.role === "system";

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className="shrink-0">
        {isUser ? (
          <Avatar label={initials(userLabel || "You")} variant="user" />
        ) : isTool ? (
          <Avatar icon={<GearIcon />} variant="tool" />
        ) : isSystem ? (
          <Avatar icon={<ChatBubbleIcon />} variant="system" />
        ) : (
          <Avatar icon={<LogoMark size="sm" />} variant="agent" raw />
        )}
      </div>
      <div className={cn("flex min-w-0 max-w-[680px] flex-col", isUser ? "items-end" : "items-start")}>
        <div className="flex items-baseline gap-2 text-[10px] uppercase tracking-wider text-app-muted">
          <span className="font-extrabold">
            {isUser ? "You" : isTool ? "Tool" : isSystem ? "System" : turn.actorLabel || "Agent"}
          </span>
          {turn.meta ? <span>{turn.meta}</span> : null}
        </div>
        <div
          className={cn(
            "mt-1 rounded-[12px] border border-app-border px-3 py-2 text-[13px] leading-[1.5] whitespace-pre-wrap",
            isUser
              ? "bg-app-input text-app-text"
              : isTool
              ? "bg-app-panel-deep text-app-text font-mono text-[12px]"
              : isSystem
              ? "bg-[#7F1D1D]/15 text-[#ff8f8f] border-[#7F1D1D]/40"
              : "bg-app-panel-bubble text-app-text"
          )}
        >
          {turn.kind === "artifact" && turn.artifact ? (
            <ArtifactTurnCard turn={turn} />
          ) : !isUser && !isTool && !isSystem ? (
            <MarkdownMessage>{turn.text}</MarkdownMessage>
          ) : (
            turn.text
          )}
        </div>
      </div>
    </div>
  );
}

function ArtifactTurnCard({ turn }: { turn: ChatTurn }) {
  const artifact = turn.artifact;
  const href = artifact?.previewUrl || artifact?.uri;
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[12px] font-extrabold text-app-text">{artifact?.name || turn.text}</div>
      <div className="text-[11px] text-app-muted">{artifact?.kind || "artifact"}</div>
      {href ? (
        <a className="text-[12px] text-app-text underline underline-offset-2" href={href} target="_blank" rel="noreferrer">
          Open artifact
        </a>
      ) : null}
    </div>
  );
}

function WorkingIndicator({ label }: { label: string }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0"><Avatar icon={<LogoMark size="sm" />} variant="agent" raw /></div>
      <div className="flex min-w-0 max-w-[680px] flex-col items-start">
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-app-muted">Agent</div>
        <div className="mt-1 flex items-center gap-2 rounded-[12px] border border-app-border bg-app-panel-bubble px-3 py-2 text-[13px] text-app-muted">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-app-text/50" />
          {label}
        </div>
      </div>
    </div>
  );
}

function Avatar({
  label,
  icon,
  variant,
  raw
}: {
  label?: string;
  icon?: React.ReactNode;
  variant: "user" | "agent" | "tool" | "system";
  raw?: boolean;
}) {
  if (raw && icon) return <>{icon}</>;
  const styles = {
    user: "bg-app-accent text-[#050505]",
    agent: "bg-app-input text-app-text border border-app-border",
    tool: "bg-app-panel-deep text-app-text border border-app-border",
    system: "bg-[#7F1D1D]/30 text-[#ff8f8f] border border-[#7F1D1D]/50"
  } as const;
  return (
    <div className={cn("flex h-8 w-8 items-center justify-center rounded-[8px] text-[11px] font-extrabold", styles[variant])}>
      {label ?? icon}
    </div>
  );
}

function isTerminal(status?: string) {
  if (!status) return false;
  return ["succeeded", "failed", "cancelled", "timed_out"].includes(status);
}

function initials(label: string): string {
  return label
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!)
    .join("")
    .toUpperCase();
}

function formatRelative(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const delta = Date.now() - t;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h`;
  return new Date(iso).toLocaleDateString();
}
