"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import { StatusPill } from "./status-pill";
import { Button } from "./button";

type ArtifactTileProps = {
  kind: string;
  title: string;
  body: string;
  action: string;
  storage?: string;
  href?: string;
  className?: string;
};

export function ArtifactTile({
  kind,
  title,
  body,
  action,
  storage = "S3 pointer",
  href,
  className
}: ArtifactTileProps) {
  function onOpen() {
    if (!href) return;
    if (href.startsWith("#")) {
      document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    window.location.assign(href);
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-[12px] border border-app-border bg-app-input p-3 h-full",
        className
      )}
    >
      <div className="flex flex-wrap gap-1.5">
        <StatusPill label={kind} />
        <StatusPill label={storage} tone="warning" />
      </div>
      <div className="text-sm font-black text-app-text truncate">{title}</div>
      <div className="flex-1 text-[12px] leading-[1.3] text-app-muted line-clamp-4">{body}</div>
      <Button variant="outline" size="sm" onClick={onOpen} disabled={!href}>
        {action}
      </Button>
    </div>
  );
}
