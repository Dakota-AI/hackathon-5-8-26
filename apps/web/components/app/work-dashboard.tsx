"use client";

import * as React from "react";
import {
  ActivityLogIcon,
  CheckCircledIcon,
  FileTextIcon,
  LayoutIcon,
  ReloadIcon,
  PlusIcon
} from "@radix-ui/react-icons";
import {
  buildWorkItemDetailView,
  deriveWorkItemSummary,
  normalizeWorkItemState,
  type WorkItem
} from "../../lib/work-items";
import {
  createControlApiWorkItem,
  type WorkItemRecord
} from "../../lib/control-api";
import { useWorkItems, useWorkItemDetail } from "../../lib/use-work-items";
import { useAuth } from "../auth-context";
import { useWorkspace } from "../workspace-context";
import { cn } from "../../lib/utils";
import { Panel } from "./panel";
import { SectionHeader } from "./section-header";
import { StatusPill } from "./status-pill";
import { TinyStat } from "./tiny-stat";
import { WorkMiniSection } from "./work-mini-section";
import { SmallSurfaceLine } from "./small-surface-line";
import { Button } from "./button";
import { GenUiSurface } from "./genui-renderer";

export function WorkDashboard() {
  const { isAuthed, openSignIn } = useAuth();
  const { workspaceId } = useWorkspace();
  const { state, refresh, useFixtures } = useWorkItems({ isAuthed, workspaceId });
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [createError, setCreateError] = React.useState<string | null>(null);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAuthed) {
      openSignIn();
      return;
    }
    const objective = draft.trim();
    if (objective.length < 2) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createControlApiWorkItem({ workspaceId, objective });
      setDraft("");
      refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create work item.");
    } finally {
      setCreating(false);
    }
  }

  const headerTrailing = (
    <div className="flex items-center gap-2">
      {!useFixtures ? (
        <Button variant="outline" size="sm" onClick={refresh}>
          <ReloadIcon /> Refresh
        </Button>
      ) : null}
    </div>
  );

  return (
    <Panel padding={14}>
      <SectionHeader
        title="Work board"
        subtitle="Delegated work, runs, artifacts, and approvals across every active outcome."
        trailing={headerTrailing}
      />

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {useFixtures ? (
          <StatusPill label="Demo data" tone="warning" />
        ) : (
          <StatusPill label={`workspace: ${workspaceId}`} tone="info" />
        )}
        {state.kind === "loading" ? <StatusPill label="Loading…" tone="info" /> : null}
        {state.kind === "error" ? <StatusPill label="Backend error" tone="warning" /> : null}
      </div>

      <form onSubmit={onCreate} className="mt-3 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            isAuthed
              ? "New objective — e.g. 'Track competitor pricing'"
              : "Sign in to create a real work item"
          }
          className="flex-1 rounded-[8px] border border-app-border bg-app-input px-3 py-2 text-[13px] text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-text/40"
        />
        <Button type="submit" variant="primary" size="md" disabled={creating}>
          <PlusIcon /> {creating ? "Creating…" : "Create"}
        </Button>
      </form>
      {createError ? (
        <div className="mt-2 text-[12px] text-[#ff8f8f]">{createError}</div>
      ) : null}

      <div className="mt-3">
        <WorkBoardBody
          state={state}
          isAuthed={isAuthed}
          workspaceId={workspaceId}
          onSignIn={openSignIn}
        />
      </div>
    </Panel>
  );
}

function WorkBoardBody({
  state,
  isAuthed,
  workspaceId,
  onSignIn
}: {
  state: ReturnType<typeof useWorkItems>["state"];
  isAuthed: boolean;
  workspaceId: string;
  onSignIn: () => void;
}) {
  if (state.kind === "loading") {
    return (
      <div className="flex h-32 items-center justify-center text-[12px] text-app-muted">
        Loading work items…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="rounded-[10px] border border-[#7F1D1D]/60 bg-[#7F1D1D]/10 p-3 text-[12px] text-[#ff8f8f]">
        {state.message}
      </div>
    );
  }
  if (state.kind === "empty") {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-app-muted">
        <div className="text-[13px] font-extrabold text-app-text">No delegated work yet.</div>
        <div className="text-[12px]">Create your first WorkItem above to start delegating outcomes.</div>
      </div>
    );
  }
  if (state.kind === "fixture") {
    return (
      <FixtureBoard items={state.items} isAuthed={isAuthed} onSignIn={onSignIn} />
    );
  }
  return <RealBoard items={state.items} workspaceId={workspaceId} />;
}

function FixtureBoard({
  items,
  isAuthed,
  onSignIn
}: {
  items: WorkItem[];
  isAuthed: boolean;
  onSignIn: () => void;
}) {
  const [selectedId, setSelectedId] = React.useState(items[0]?.id ?? null);
  const selected = items.find((item) => item.id === selectedId) ?? items[0]!;
  return (
    <div className="flex flex-col gap-3 xl:flex-row">
      <div className="xl:flex-[4]">
        <div className="text-[12px] font-extrabold text-app-text mb-2">Delegated work</div>
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <FixtureItemCard
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              onClick={() => setSelectedId(item.id)}
            />
          ))}
        </div>
      </div>
      <div className="xl:flex-[7] min-w-0">
        <FixtureDetail item={selected} isAuthed={isAuthed} onSignIn={onSignIn} />
      </div>
    </div>
  );
}

function FixtureItemCard({
  item,
  selected,
  onClick
}: {
  item: WorkItem;
  selected: boolean;
  onClick: () => void;
}) {
  const summary = deriveWorkItemSummary(item);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-[10px] border p-2.5 transition-colors w-full",
        selected
          ? "bg-app-input border-app-text"
          : "bg-app-panel border-app-border hover:border-app-border-strong"
      )}
    >
      <div className="flex flex-wrap gap-1.5">
        <StatusPill label={summary.primaryStatusLabel} tone="info" />
        <StatusPill label={summary.priorityLabel} tone="warning" />
      </div>
      <div className="mt-2 text-sm font-black text-app-text truncate">{item.title}</div>
      <div className="mt-1 text-[12px] leading-[1.25] text-app-muted line-clamp-2">{item.nextAction}</div>
      <div className="mt-2 text-[11px] text-app-muted">
        {summary.runSummary} · {summary.artifactSummary} · {summary.approvalSummary}
      </div>
    </button>
  );
}

function FixtureDetail({
  item,
  isAuthed,
  onSignIn
}: {
  item: WorkItem;
  isAuthed: boolean;
  onSignIn: () => void;
}) {
  const detail = buildWorkItemDetailView(item);
  return (
    <div className="rounded-[10px] border border-app-border bg-app-input p-3">
      <div className="flex flex-wrap gap-1.5">
        <StatusPill label={detail.primaryStatusLabel} tone="info" />
        <StatusPill label={`Owner: ${detail.owner}`} tone="success" />
        <StatusPill label={`Updated ${detail.updatedAt}`} tone="warning" />
      </div>
      <div className="mt-2 text-[18px] font-black text-app-text leading-tight">{detail.title}</div>
      <p className="mt-1.5 text-[12px] leading-[1.4] text-app-muted">{detail.objective}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TinyStat label="Runs" value={String(item.runs.length)} />
        <TinyStat label="Artifacts" value={String(item.artifacts.length)} />
        <TinyStat label="Approvals" value={String(item.approvals.length)} />
        <TinyStat label="Surfaces" value={String(detail.sections.surfaces.length)} />
      </div>

      <div className="mt-3.5 flex flex-col gap-3.5">
        <WorkMiniSection title="Next decision">
          <SmallSurfaceLine
            icon={<CheckCircledIcon />}
            title={item.nextAction}
            subtitle={`Owner: ${item.owner}`}
          />
          {!isAuthed ? (
            <Button variant="primary" size="md" onClick={onSignIn} className="mt-1 self-start">
              Sign in to approve
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={() => window.location.assign("/approvals")}
              className="mt-1 self-start"
            >
              Approve
            </Button>
          )}
        </WorkMiniSection>

        {item.events.length > 0 ? (
          <WorkMiniSection title="Event timeline">
            {item.events.slice(0, 3).map((event) => (
              <SmallSurfaceLine
                key={event.id}
                icon={<ActivityLogIcon />}
                title={event.label}
                subtitle={`${event.at} · ${event.detail}`}
              />
            ))}
          </WorkMiniSection>
        ) : null}

        {item.artifacts.length > 0 ? (
          <WorkMiniSection title="Artifacts">
            {item.artifacts.slice(0, 3).map((artifact) => (
              <SmallSurfaceLine
                key={artifact.id}
                icon={<FileTextIcon />}
                title={artifact.name}
                subtitle={`${artifact.kind} · ${artifact.state} · ${artifact.updatedAt}`}
              />
            ))}
          </WorkMiniSection>
        ) : null}

        <WorkMiniSection title="Generated surface review">
          {detail.sections.surfaces.length > 0 ? (
            detail.sections.surfaces.map((surface) => (
              <SmallSurfaceLine
                key={surface.id}
                icon={<LayoutIcon />}
                title={surface.title}
                subtitle={`${surface.kind} · ${surface.componentCount} components · ${surface.dataSources.join(", ")}`}
              />
            ))
          ) : (
            <SmallSurfaceLine
              icon={<LayoutIcon />}
              title="No validated surfaces yet"
              subtitle="Generated UI remains hidden until server validation passes."
            />
          )}
        </WorkMiniSection>
      </div>
    </div>
  );
}

function RealBoard({ items, workspaceId }: { items: WorkItemRecord[]; workspaceId: string }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(items[0]?.workItemId ?? null);
  const selected = items.find((i) => i.workItemId === selectedId) ?? items[0]!;
  return (
    <div className="flex flex-col gap-3 xl:flex-row">
      <div className="xl:flex-[4]">
        <div className="text-[12px] font-extrabold text-app-text mb-2">
          Delegated work · {items.length}
        </div>
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <RealItemCard
              key={item.workItemId}
              item={item}
              selected={item.workItemId === selected.workItemId}
              onClick={() => setSelectedId(item.workItemId)}
            />
          ))}
        </div>
      </div>
      <div className="xl:flex-[7] min-w-0">
        <RealDetail item={selected} workspaceId={workspaceId} />
      </div>
    </div>
  );
}

function RealItemCard({
  item,
  selected,
  onClick
}: {
  item: WorkItemRecord;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-[10px] border p-2.5 transition-colors w-full",
        selected
          ? "bg-app-input border-app-text"
          : "bg-app-panel border-app-border hover:border-app-border-strong"
      )}
    >
      <div className="flex flex-wrap gap-1.5">
        <StatusPill label={item.status} tone="info" />
        {item.priority ? <StatusPill label={item.priority} tone="warning" /> : null}
      </div>
      <div className="mt-2 text-sm font-black text-app-text truncate">
        {item.title || item.objective}
      </div>
      {item.title && item.objective !== item.title ? (
        <div className="mt-1 text-[12px] leading-[1.25] text-app-muted line-clamp-2">
          {item.objective}
        </div>
      ) : null}
      <div className="mt-2 text-[11px] text-app-muted">
        {item.ownerEmail || item.userId || "—"} · updated {formatRelative(item.updatedAt)}
      </div>
    </button>
  );
}

function RealDetail({ item, workspaceId }: { item: WorkItemRecord; workspaceId: string }) {
  const { isAuthed } = useAuth();
  const { detail, loading, error } = useWorkItemDetail({
    isAuthed,
    workspaceId,
    workItemId: item.workItemId
  });

  return (
    <div className="rounded-[10px] border border-app-border bg-app-input p-3">
      <div className="flex flex-wrap gap-1.5">
        <StatusPill label={normalizeStatusLabel(item.status)} tone="info" />
        {item.ownerEmail ? <StatusPill label={`Owner: ${item.ownerEmail}`} tone="success" /> : null}
        <StatusPill label={`Updated ${formatRelative(item.updatedAt)}`} tone="warning" />
      </div>
      <div className="mt-2 text-[18px] font-black text-app-text leading-tight">
        {item.title || item.objective}
      </div>
      <p className="mt-1.5 text-[12px] leading-[1.4] text-app-muted">{item.objective}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TinyStat label="Runs" value={String(detail?.runs.length ?? 0)} />
        <TinyStat label="Artifacts" value={String(detail?.artifacts.length ?? 0)} />
        <TinyStat
          label="Surfaces"
          value={String(detail?.surfaces.filter((s) => s.validation === "server-validated").length ?? 0)}
        />
        <TinyStat label="Events" value={String(detail?.events.length ?? 0)} />
      </div>

      {error ? (
        <div className="mt-3 rounded-[8px] border border-[#7F1D1D]/60 bg-[#7F1D1D]/10 p-2.5 text-[12px] text-[#ff8f8f]">
          {error}
        </div>
      ) : null}

      <div className="mt-3.5 flex flex-col gap-3.5">
        {loading ? (
          <div className="text-[12px] text-app-muted">Loading detail…</div>
        ) : detail ? (
          <>
            {detail.runs.length > 0 ? (
              <WorkMiniSection title="Runs">
                {detail.runs.slice(0, 4).map((run) => (
                  <SmallSurfaceLine
                    key={run.runId}
                    icon={<ActivityLogIcon />}
                    title={`run ${run.runId.slice(-8)}`}
                    subtitle={`${run.status} · ${formatRelative(run.updatedAt || run.createdAt)}`}
                  />
                ))}
              </WorkMiniSection>
            ) : null}

            {detail.events.length > 0 ? (
              <WorkMiniSection title="Recent events">
                {detail.events.slice(-4).reverse().map((event) => (
                  <SmallSurfaceLine
                    key={event.id || `${event.runId}-${event.seq}`}
                    icon={<ActivityLogIcon />}
                    title={event.type}
                    subtitle={formatRelative(event.createdAt)}
                  />
                ))}
              </WorkMiniSection>
            ) : null}

            {detail.artifacts.length > 0 ? (
              <WorkMiniSection title="Artifacts">
                {detail.artifacts.slice(0, 4).map((a) => (
                  <SmallSurfaceLine
                    key={a.artifactId}
                    icon={<FileTextIcon />}
                    title={a.name || a.artifactId}
                    subtitle={`${a.kind || "artifact"} · ${a.state || "ready"}`}
                  />
                ))}
              </WorkMiniSection>
            ) : null}

            {detail.surfaces.length > 0 ? (
              <WorkMiniSection title="Generated surfaces">
                <div className="flex flex-col gap-3">
                  {detail.surfaces.slice(0, 3).map((s) => (
                    <GenUiSurface key={s.surfaceId} surface={s} />
                  ))}
                </div>
              </WorkMiniSection>
            ) : (
              <WorkMiniSection title="Generated surfaces">
                <SmallSurfaceLine
                  icon={<LayoutIcon />}
                  title="No validated surfaces yet"
                  subtitle="Generated UI appears here once a run produces a server-validated surface."
                />
              </WorkMiniSection>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function formatRelative(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const delta = Date.now() - t;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)} min ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)} hr ago`;
  return new Date(iso).toLocaleDateString();
}

function normalizeStatusLabel(status: string): string {
  if (!status) return "—";
  const known = status.replace(/_/g, " ");
  try {
    return normalizeWorkItemState(status as Parameters<typeof normalizeWorkItemState>[0]);
  } catch {
    return known.charAt(0).toUpperCase() + known.slice(1);
  }
}
