import * as React from "react";
import { cn } from "../../lib/utils";
import { StatusPill } from "./status-pill";

type TimelineItemProps = {
  status: string;
  title: string;
  body: string;
  isLast?: boolean;
  index?: number;
  className?: string;
};

export function TimelineItem({ status, title, body, isLast, index, className }: TimelineItemProps) {
  return (
    <div className={cn("flex gap-3", isLast ? "" : "pb-4", className)}>
      <div className="flex flex-col items-center shrink-0">
        <div className="relative flex h-2.5 w-2.5 items-center justify-center rounded-full bg-app-accent">
          {typeof index === "number" ? (
            <span className="absolute -right-5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-app-muted">
              {index + 1}
            </span>
          ) : null}
        </div>
        {!isLast ? <div className="mt-1 w-px flex-1 bg-app-border" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <StatusPill label={status} />
        <div className="mt-1 text-sm font-extrabold text-app-text">{title}</div>
        <div className="mt-0.5 text-[12px] leading-[1.35] text-app-muted">{body}</div>
      </div>
    </div>
  );
}
