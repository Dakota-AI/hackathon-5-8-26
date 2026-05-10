import * as React from "react";
import { cn } from "../../lib/utils";

type TinyStatProps = {
  label: string;
  value: string;
  className?: string;
};

export function TinyStat({ label, value, className }: TinyStatProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-[3px]",
        "bg-app-panel border border-app-border rounded-[8px]",
        "px-[9px] py-2 min-w-0",
        className
      )}
    >
      <div className="text-[10px] text-app-muted leading-none">{label}</div>
      <div className="text-[16px] font-black text-app-text leading-none">{value}</div>
    </div>
  );
}
