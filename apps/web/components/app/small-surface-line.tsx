import * as React from "react";
import { cn } from "../../lib/utils";

type SmallSurfaceLineProps = {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  className?: string;
};

export function SmallSurfaceLine({ icon, title, subtitle, className }: SmallSurfaceLineProps) {
  return (
    <div className={cn("flex items-start gap-2 pb-[7px]", className)}>
      <div className="mt-[2px] shrink-0 text-app-text [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-extrabold text-app-text truncate">{title}</div>
        <div className="mt-[2px] text-[11px] leading-[1.25] text-app-muted line-clamp-2">{subtitle}</div>
      </div>
    </div>
  );
}
