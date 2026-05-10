import * as React from "react";
import { cn } from "../../lib/utils";

type PanelProps = React.HTMLAttributes<HTMLDivElement> & {
  padding?: 8 | 9 | 10 | 11 | 12 | 14 | 16 | 22;
  surface?: "panel" | "input" | "panel-deep";
};

const paddingClass: Record<NonNullable<PanelProps["padding"]>, string> = {
  8: "p-2",
  9: "p-[9px]",
  10: "p-2.5",
  11: "p-[11px]",
  12: "p-3",
  14: "p-3.5",
  16: "p-4",
  22: "p-[22px]"
};

const surfaceClass: Record<NonNullable<PanelProps["surface"]>, string> = {
  panel: "bg-app-panel",
  input: "bg-app-input",
  "panel-deep": "bg-app-panel-deep"
};

export function Panel({
  padding = 12,
  surface = "panel",
  className,
  ...rest
}: PanelProps) {
  return (
    <div
      className={cn(
        surfaceClass[surface],
        "border border-app-border rounded-[10px]",
        paddingClass[padding],
        className
      )}
      {...rest}
    />
  );
}
