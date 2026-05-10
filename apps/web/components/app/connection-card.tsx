import * as React from "react";
import { Panel } from "./panel";
import { StatusPill } from "./status-pill";

type ConnectionCardProps = {
  pills?: { label: string; tone?: "success" | "warning" | "info" }[];
  caption?: string;
};

export function ConnectionCard({
  pills = [
    { label: "Amplify Auth configured", tone: "success" },
    { label: "Control API configured", tone: "success" }
  ],
  caption = "Cognito Auth and the deployed Control API are wired into this client."
}: ConnectionCardProps) {
  return (
    <Panel padding={10} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {pills.map((p) => (
          <StatusPill key={p.label} label={p.label} tone={p.tone} />
        ))}
      </div>
      <div className="text-[11px] leading-[1.35] text-app-muted">{caption}</div>
    </Panel>
  );
}
