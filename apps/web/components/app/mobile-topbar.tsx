"use client";

import * as React from "react";
import { useAuth } from "../auth-context";
import { LogoMark } from "./logo-mark";
import { StatusPill } from "./status-pill";
import { Button } from "./button";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function MobileTopBar() {
  const { isAuthed, openSignIn } = useAuth();
  return (
    <header className="flex h-12 items-center gap-2.5 bg-app-sidebar px-3">
      <LogoMark size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-black leading-tight text-app-text truncate">Agents Cloud</div>
        <div className="text-[10px] text-app-muted truncate">Command, runs, approvals</div>
      </div>
      {isAuthed ? (
        <WorkspaceSwitcher compact />
      ) : (
        <Button variant="primary" size="sm" onClick={openSignIn}>
          Sign in
        </Button>
      )}
    </header>
  );
}
