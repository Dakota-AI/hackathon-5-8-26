import * as React from "react";
import { Panel } from "./panel";
import { StatusPill } from "./status-pill";
import { Button } from "./button";

type ApprovalCardProps = {
  risk: string;
  title: string;
  body: string;
  intent?: string;
  disabled?: boolean;
};

export function ApprovalCard({
  risk,
  title,
  body,
  intent = "approval.requested",
  disabled = true
}: ApprovalCardProps) {
  return (
    <Panel padding={12} className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        <StatusPill label={risk} tone="warning" />
        <StatusPill label={intent} tone="info" />
      </div>
      <div className="text-[16px] font-black text-app-text">{title}</div>
      <div className="text-sm leading-[1.4] text-app-muted">{body}</div>
      <div className="mt-1 flex flex-wrap gap-2">
        <Button variant="primary" size="md" disabled={disabled}>
          Approve
        </Button>
        <Button variant="outline" size="md" disabled={disabled}>
          Request revision
        </Button>
        <Button variant="destructive" size="md" disabled={disabled}>
          Deny
        </Button>
      </div>
    </Panel>
  );
}
