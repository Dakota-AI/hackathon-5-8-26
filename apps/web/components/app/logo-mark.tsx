import * as React from "react";
import { CubeIcon } from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";

type LogoMarkProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeMap = {
  sm: { box: "h-7 w-7 rounded-[8px]", icon: "h-4 w-4" },
  md: { box: "h-[34px] w-[34px] rounded-[10px]", icon: "h-[19px] w-[19px]" },
  lg: { box: "h-10 w-10 rounded-[12px]", icon: "h-5 w-5" }
};

export function LogoMark({ size = "md", className }: LogoMarkProps) {
  const s = sizeMap[size];
  return (
    <div
      className={cn(
        "flex items-center justify-center shrink-0",
        s.box,
        "border border-white/35 bg-white/10",
        className
      )}
    >
      <CubeIcon className={cn(s.icon, "text-app-accent")} />
    </div>
  );
}
