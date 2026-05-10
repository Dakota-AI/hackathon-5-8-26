import * as React from "react";
import { cn } from "../../lib/utils";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  className?: string;
};

export function SectionHeader({ title, subtitle, trailing, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="text-[16px] font-extrabold tracking-[-0.01em] text-app-text">{title}</div>
        {subtitle ? (
          <div className="mt-1 text-[12px] leading-[1.35] text-app-muted">{subtitle}</div>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
