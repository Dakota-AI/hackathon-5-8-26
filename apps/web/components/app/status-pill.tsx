import * as React from "react";
import { cn } from "../../lib/utils";

export type StatusPillTone = "info" | "success" | "warning" | "accent" | "danger";

type StatusPillProps = {
  label: string;
  /**
   * Semantic intent — currently rendered monochrome (matches Flutter `_StatusPill`
   * which receives a color but `OutlineBadge` ignores it). Kept in API for future
   * colorization.
   */
  tone?: StatusPillTone;
  className?: string;
};

export function StatusPill({ label, tone: _tone, className }: StatusPillProps) {
  void _tone;
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5",
        "border border-app-border rounded-[3px]",
        "text-[11px] font-bold leading-tight text-app-text",
        "bg-transparent whitespace-nowrap",
        className
      )}
    >
      {label}
    </span>
  );
}
