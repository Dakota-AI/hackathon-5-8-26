"use client";

import * as React from "react";
import { GlobeIcon, LockClosedIcon } from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import { Button } from "./button";

type BrowserToolbarProps = {
  url: string;
  className?: string;
};

export function BrowserToolbar({ url, className }: BrowserToolbarProps) {
  const [copied, setCopied] = React.useState(false);

  async function onShare() {
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[12px] border border-app-border bg-app-input p-2",
        className
      )}
    >
      <LockClosedIcon className="h-3.5 w-3.5 shrink-0 text-app-text" />
      <div className="min-w-0 flex-1 truncate text-[12px] text-app-text font-mono">{url}</div>
      <Button variant="outline" size="sm" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
        Open
      </Button>
      <Button variant="outline" size="sm" onClick={() => void onShare()}>
        {copied ? "Copied" : "Share"}
      </Button>
    </div>
  );
}

type BrowserFramePlaceholderProps = {
  title?: string;
  caption?: string;
  className?: string;
};

export function BrowserFramePlaceholder({
  title = "Embedded preview slot",
  caption = "Connect a built site preview, doc render, or live screenshot here.",
  className
}: BrowserFramePlaceholderProps) {
  return (
    <div
      className={cn(
        "flex h-[170px] items-center justify-center rounded-[12px] border border-app-border bg-app-panel-deep p-4",
        className
      )}
    >
      <div className="flex flex-col items-center text-center max-w-[340px]">
        <GlobeIcon className="h-7 w-7 text-app-text/80" />
        <div className="mt-2.5 text-sm font-black text-app-text">{title}</div>
        <div className="mt-1.5 text-[12px] leading-[1.35] text-app-muted">{caption}</div>
      </div>
    </div>
  );
}
