import * as React from "react";
import { GearIcon } from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import { StatusPill } from "./status-pill";

type ToolCallCardProps = {
  title: string;
  subtext: string;
  status?: string;
  className?: string;
};

export function ToolCallCard({ title, subtext, status = "approval", className }: ToolCallCardProps) {
  return (
    <div className={cn("rounded-[12px] border border-app-border bg-app-input p-3", className)}>
      <div className="flex items-start gap-2.5">
        <GearIcon className="mt-[2px] h-4 w-4 shrink-0 text-app-text" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold text-app-text">{title}</div>
          <div className="mt-1 text-[12px] leading-[1.35] text-app-muted">{subtext}</div>
        </div>
        <StatusPill label={status} tone="warning" className="shrink-0" />
      </div>
    </div>
  );
}
