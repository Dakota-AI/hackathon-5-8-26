import * as React from "react";
import { cn } from "../../lib/utils";

type WorkMiniSectionProps = {
  title: string;
  children: React.ReactNode;
  className?: string;
};

export function WorkMiniSection({ title, children, className }: WorkMiniSectionProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="text-[12px] font-black text-app-text">{title}</div>
      <div className="mt-[7px] flex flex-col">{children}</div>
    </div>
  );
}
