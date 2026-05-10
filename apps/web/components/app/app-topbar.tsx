"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../auth-context";
import { StatusPill } from "./status-pill";
import { Button } from "./button";
import { WorkspaceSwitcher } from "./workspace-switcher";

const titleByPath: { match: (p: string) => boolean; title: string }[] = [
  { match: (p) => p === "/", title: "CEO command center" },
  { match: (p) => p.startsWith("/runs"), title: "Runs" },
  { match: (p) => p.startsWith("/agents"), title: "Agents & Teams" },
  { match: (p) => p.startsWith("/artifacts"), title: "Artifacts" },
  { match: (p) => p.startsWith("/miro"), title: "Miro Boards" },
  { match: (p) => p.startsWith("/approvals"), title: "Approvals" }
];

export function AppTopBar() {
  const pathname = usePathname() ?? "/";
  const { isAuthed, userLabel, openSignIn, signOut } = useAuth();
  const title = titleByPath.find((t) => t.match(pathname))?.title ?? "Agents Cloud";

  return (
    <header className="flex h-[54px] items-center gap-3 px-4">
      <div className="flex-1 text-[16px] font-extrabold tracking-[-0.01em] text-app-text truncate">
        {title}
      </div>
      <div className="hidden md:flex items-center gap-2">
        <WorkspaceSwitcher />
        <StatusPill label="Control API live" tone="success" />
        <StatusPill label="GenUI ready" tone="success" />
      </div>
      <div className="flex items-center gap-2">
        {isAuthed ? (
          <>
            <span className="hidden sm:inline-block text-[12px] text-app-muted truncate max-w-[180px]">
              {userLabel}
            </span>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </>
        ) : (
          <Button variant="primary" size="sm" onClick={openSignIn}>
            Sign in
          </Button>
        )}
      </div>
    </header>
  );
}
