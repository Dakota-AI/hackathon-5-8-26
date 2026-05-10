"use client";

import * as React from "react";
import {
  getControlApiHealth,
  listControlApiWorkItems,
  listControlApiWorkItemArtifacts,
  listControlApiWorkItemEvents,
  listControlApiWorkItemRuns,
  listControlApiWorkItemSurfaces,
  type RunEvent,
  type WorkItemArtifactRecord,
  type WorkItemRecord,
  type WorkItemRunRecord,
  type WorkItemSurfaceRecord
} from "./control-api";
import { listFixtureWorkItems, type WorkItem } from "./work-items";

export type WorkItemDetailBundle = {
  workItem: WorkItemRecord | null;
  runs: WorkItemRunRecord[];
  events: RunEvent[];
  artifacts: WorkItemArtifactRecord[];
  surfaces: WorkItemSurfaceRecord[];
};

export type WorkBoardState =
  | { kind: "loading" }
  | { kind: "fixture"; items: WorkItem[] }
  | { kind: "empty" }
  | { kind: "ready"; items: WorkItemRecord[] }
  | { kind: "error"; message: string };

export function useWorkItems({
  isAuthed,
  workspaceId
}: {
  isAuthed: boolean;
  workspaceId: string;
}) {
  const api = getControlApiHealth();
  const useFixtures = !isAuthed || !api.configured;

  const [state, setState] = React.useState<WorkBoardState>({ kind: "loading" });
  const [refreshTick, setRefreshTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    if (useFixtures) {
      setState({ kind: "fixture", items: listFixtureWorkItems() });
      return;
    }
    setState({ kind: "loading" });
    (async () => {
      try {
        const response = await listControlApiWorkItems({ workspaceId, limit: 50 });
        if (cancelled) return;
        if (!response.workItems || response.workItems.length === 0) {
          setState({ kind: "empty" });
        } else {
          setState({ kind: "ready", items: response.workItems });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Unable to load work items."
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useFixtures, workspaceId, refreshTick]);

  const refresh = React.useCallback(() => setRefreshTick((n) => n + 1), []);
  return { state, refresh, useFixtures };
}

export function useWorkItemDetail({
  isAuthed,
  workspaceId,
  workItemId
}: {
  isAuthed: boolean;
  workspaceId: string;
  workItemId: string | null;
}): { detail: WorkItemDetailBundle | null; loading: boolean; error: string | null; refresh: () => void } {
  const api = getControlApiHealth();
  const enabled = isAuthed && api.configured && !!workItemId;
  const [detail, setDetail] = React.useState<WorkItemDetailBundle | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!enabled || !workItemId) {
      setDetail(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [runsR, eventsR, artifactsR, surfacesR] = await Promise.all([
          listControlApiWorkItemRuns({ workspaceId, workItemId }).catch(() => ({ runs: [] })),
          listControlApiWorkItemEvents({ workspaceId, workItemId, limit: 100 }).catch(() => ({
            events: []
          })),
          listControlApiWorkItemArtifacts({ workspaceId, workItemId }).catch(() => ({
            artifacts: []
          })),
          listControlApiWorkItemSurfaces({ workspaceId, workItemId }).catch(() => ({
            surfaces: []
          }))
        ]);
        if (cancelled) return;
        setDetail({
          workItem: null,
          runs: runsR.runs,
          events: eventsR.events,
          artifacts: artifactsR.artifacts,
          surfaces: surfacesR.surfaces
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load work item.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, workspaceId, workItemId, tick]);

  return { detail, loading, error, refresh: () => setTick((n) => n + 1) };
}
