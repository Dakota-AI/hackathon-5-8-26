"use client";

import * as React from "react";
import { MetricCard } from "./metric-card";
import { useAuth } from "../auth-context";
import { useWorkspace } from "../workspace-context";
import { useWorkItems } from "../../lib/use-work-items";

export function MetricsStrip() {
  const { isAuthed } = useAuth();
  const { workspaceId } = useWorkspace();
  const { state, useFixtures } = useWorkItems({ isAuthed, workspaceId });

  const cards = React.useMemo(() => {
    if (state.kind === "ready") {
      const running = state.items.filter((item) =>
        ["queued", "planning", "running", "testing", "archiving"].includes(item.status)
      ).length;
      const done = state.items.filter((item) => item.status === "succeeded").length;
      return [
        { label: "Work items", value: String(state.items.length), hint: "Live" },
        { label: "Active", value: String(running), hint: "In progress" },
        { label: "Completed", value: String(done), hint: "Succeeded" },
        { label: "Workspace", value: workspaceId.slice(-8), hint: "Connected" }
      ];
    }

    if (state.kind === "fixture") {
      return [
        { label: "Work items", value: String(state.items.length), hint: "Fixture" },
        { label: "Active", value: String(state.items.length), hint: "Local" },
        { label: "Completed", value: "0", hint: "Local" },
        { label: "Workspace", value: "local", hint: "Sign in for live" }
      ];
    }

    return [
      { label: "Work items", value: "—", hint: useFixtures ? "Fixture" : "Loading" },
      { label: "Active", value: "—", hint: "Awaiting data" },
      { label: "Completed", value: "—", hint: "Awaiting data" },
      { label: "Workspace", value: useFixtures ? "local" : workspaceId.slice(-8), hint: useFixtures ? "Sign in for live" : "Connected" }
    ];
  }, [state, useFixtures, workspaceId]);

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-2.5">
      {cards.map((c) => (
        <MetricCard key={c.label} {...c} />
      ))}
    </div>
  );
}
