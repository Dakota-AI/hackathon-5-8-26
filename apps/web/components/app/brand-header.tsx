import * as React from "react";
import { LogoMark } from "./logo-mark";

export function BrandHeader({
  title = "Agents Cloud",
  subtitle = "Autonomous company console"
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size="md" />
      <div className="min-w-0">
        <div className="text-[16px] font-extrabold leading-tight text-app-text truncate">{title}</div>
        <div className="mt-[2px] text-[11px] text-app-muted truncate">{subtitle}</div>
      </div>
    </div>
  );
}
