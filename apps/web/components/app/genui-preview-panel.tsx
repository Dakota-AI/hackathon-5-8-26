import * as React from "react";
import { Panel } from "./panel";
import { SectionHeader } from "./section-header";
import { StatusPill } from "./status-pill";

export function GenUiPreviewPanel() {
  return (
    <Panel padding={14}>
      <SectionHeader
        title="Live GenUI surface"
        subtitle="Streaming generated UI from the GenUI A2UI runtime."
      />
      <div className="mt-2.5 flex flex-wrap gap-2">
        <StatusPill label="Google GenUI bridge" tone="success" />
        <StatusPill label="A2UI v0.9" tone="info" />
      </div>
      <div className="mt-3 rounded-[12px] border border-app-border bg-black/20 p-3">
        <div className="text-[15px] font-extrabold text-app-text">Live GenUI command dashboard</div>
        <p className="mt-1.5 text-[12px] leading-[1.4] text-app-muted">
          When a run produces a server-validated A2UI surface, it appears here — composed from the agent's
          structured output, with no raw HTML reaching the client.
        </p>
        <div className="mt-2 text-[10px] text-app-muted">
          Waiting for GenUI surface…
        </div>
      </div>
    </Panel>
  );
}
