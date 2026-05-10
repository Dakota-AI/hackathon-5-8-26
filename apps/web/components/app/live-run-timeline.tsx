import * as React from "react";
import { Panel } from "./panel";
import { SectionHeader } from "./section-header";
import { TimelineItem } from "./timeline-item";

const items = [
  {
    status: "Planned",
    title: "Plan and decompose",
    body: "Executive plans the work and routes subtasks to research, build, and writer agents."
  },
  {
    status: "Planned",
    title: "Tool-augmented execution",
    body: "Agents call typed tools, retrieve sources, and write artifacts to S3."
  },
  {
    status: "Planned",
    title: "Validate generated UI",
    body: "Server-side validators gate any A2UI/GenUI output before the client renders it."
  },
  {
    status: "Planned",
    title: "Approve & publish",
    body: "Approvals open for risky steps; on approval, artifacts publish to preview hosting."
  }
];

export function LiveRunTimeline() {
  return (
    <Panel padding={14}>
      <SectionHeader
        title="Autonomous run timeline"
        subtitle="Tasks → assistants → tools → preview → approvals → publish."
      />
      <div className="mt-3.5">
        {items.map((item, i) => (
          <TimelineItem key={i} {...item} isLast={i === items.length - 1} />
        ))}
      </div>
    </Panel>
  );
}
