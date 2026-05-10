import * as React from "react";
import { cn } from "../../lib/utils";
import { Panel } from "./panel";

type MetricCardProps = {
  label: string;
  value: string;
  hint: string;
  className?: string;
};

export function MetricCard({ label, value, hint, className }: MetricCardProps) {
  return (
    <Panel padding={12} className={cn("flex flex-col gap-1.5 min-w-0", className)}>
      <div className="text-[11px] text-app-muted leading-none">{label}</div>
      <div className="text-[24px] font-black text-app-text leading-none tracking-[-0.02em]">{value}</div>
      <div className="text-[10px] text-app-muted truncate">{hint}</div>
    </Panel>
  );
}
