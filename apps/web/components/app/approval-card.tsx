"use client";

import * as React from "react";
import { Panel } from "./panel";
import { StatusPill } from "./status-pill";
import { Button } from "./button";

type ApprovalCardProps = {
  risk: string;
  title: string;
  body: string;
  intent?: string;
};

export function ApprovalCard({
  risk,
  title,
  body,
  intent = "approval.requested"
}: ApprovalCardProps) {
  const [decision, setDecision] = React.useState<"approved" | "revision requested" | "denied" | null>(null);

  return (
    <Panel padding={12} className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        <StatusPill label={risk} tone="warning" />
        <StatusPill label={intent} tone="info" />
        {decision ? <StatusPill label={decision} tone={decision === "denied" ? "warning" : "success"} /> : null}
      </div>
      <div className="text-[16px] font-black text-app-text">{title}</div>
      <div className="text-sm leading-[1.4] text-app-muted">{body}</div>
      <div className="mt-1 flex flex-wrap gap-2">
        <Button variant="primary" size="md" onClick={() => setDecision("approved")}>
          Approve
        </Button>
        <Button variant="outline" size="md" onClick={() => setDecision("revision requested")}>
          Request revision
        </Button>
        <Button variant="destructive" size="md" onClick={() => setDecision("denied")}>
          Deny
        </Button>
      </div>
    </Panel>
  );
}
