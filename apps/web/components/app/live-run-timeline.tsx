"use client";

import * as React from "react";
import { Panel } from "./panel";
import { SectionHeader } from "./section-header";
import { TimelineItem } from "./timeline-item";
import { useAuth } from "../auth-context";
import { useWorkspace } from "../workspace-context";
import { useWorkItems, useWorkItemDetail } from "../../lib/use-work-items";

export function LiveRunTimeline() {
  const { isAuthed } = useAuth();
  const { workspaceId } = useWorkspace();
  const { state, useFixtures } = useWorkItems({ isAuthed, workspaceId });

  const selectedWorkItemId = state.kind === "ready" ? (state.items[0]?.workItemId ?? null) : null;
  const { detail } = useWorkItemDetail({
    isAuthed,
    workspaceId,
    workItemId: selectedWorkItemId
  });

  const items = React.useMemo(() => {
    if (state.kind === "ready") {
      const events = [...(detail?.events ?? [])]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6)
        .map((event) => ({
          status: event.type === "run.status" ? String(event.payload?.status ?? "status") : event.type,
          title: event.type,
          body: `${formatRelative(event.createdAt)} · run ${event.runId.slice(-8)}`
        }));
      if (events.length > 0) {
        return events;
      }
      return [
        {
          status: "Waiting",
          title: "No live events yet",
          body: "Start a run to stream status, artifact, and delegation events here."
        }
      ];
    }

    if (state.kind === "fixture") {
      return [
        {
          status: "Local",
          title: "Fixture mode",
          body: "Sign in to load live run events from the Control API."
        }
      ];
    }

    return [
      {
        status: useFixtures ? "Local" : "Loading",
        title: useFixtures ? "Fixture mode" : "Loading timeline",
        body: useFixtures
          ? "Sign in to load live run events from the Control API."
          : "Connecting to workspace events…"
      }
    ];
  }, [detail?.events, state, useFixtures]);

  return (
    <Panel padding={14}>
      <SectionHeader
        title="Run timeline"
        subtitle="Recent high-signal events from your latest work item."
      />
      <div className="mt-3.5">
        {items.map((item, i) => (
          <TimelineItem key={`${item.title}-${i}`} {...item} isLast={i === items.length - 1} />
        ))}
      </div>
    </Panel>
  );
}

function formatRelative(iso?: string): string {
  if (!iso) return "unknown";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const delta = Date.now() - t;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))}m ago`;
  if (delta < 86_400_000) return `${Math.max(1, Math.floor(delta / 3_600_000))}h ago`;
  return `${Math.max(1, Math.floor(delta / 86_400_000))}d ago`;
}
