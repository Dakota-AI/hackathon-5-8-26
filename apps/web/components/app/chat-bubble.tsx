import * as React from "react";
import { cn } from "../../lib/utils";
import { StatusPill } from "./status-pill";

type ChatBubbleProps = {
  role: string;
  body: string;
  alignRight?: boolean;
  className?: string;
};

export function ChatBubble({ role, body, alignRight, className }: ChatBubbleProps) {
  return (
    <div className={cn("flex w-full", alignRight ? "justify-end" : "justify-start", className)}>
      <div
        className={cn(
          "max-w-[560px] rounded-[12px] border border-app-border p-3",
          alignRight ? "bg-app-input" : "bg-app-panel-bubble"
        )}
      >
        <StatusPill label={role} />
        <p className="mt-2 text-[12px] leading-[1.4] text-app-text whitespace-pre-wrap">{body}</p>
      </div>
    </div>
  );
}
