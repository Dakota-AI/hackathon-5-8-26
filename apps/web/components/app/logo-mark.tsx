import * as React from "react";
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
      <svg
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className={cn(s.icon, "text-app-text")}
      >
        <path
          d="M32 4 C 47.4641 4 60 16.5359 60 32 C 60 47.4641 47.4641 60 32 60 C 16.5359 60 4 47.4641 4 32 C 4 19 13 9 26 5"
          stroke="currentColor"
          strokeWidth="3.25"
          strokeLinecap="round"
        />
        <circle cx="27" cy="36" r="7" fill="currentColor" />
        <path
          d="M40 38 L52 46"
          stroke="currentColor"
          strokeWidth="3.25"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
