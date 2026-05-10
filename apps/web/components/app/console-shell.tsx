"use client";

import * as React from "react";
import { AppSidebar } from "./app-sidebar";
import { AppTopBar } from "./app-topbar";
import { MobileTopBar } from "./mobile-topbar";
import { MobileNavBar } from "./mobile-navbar";

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-app-bg text-app-text md:flex-row">
      {/* Desktop sidebar — sticky to the left */}
      <div className="hidden md:flex md:flex-col md:sticky md:top-0 md:h-screen">
        <AppSidebar />
        <div className="absolute inset-y-0 right-0 w-px bg-app-border" />
      </div>

      {/* Mobile top bar */}
      <div className="md:hidden">
        <MobileTopBar />
        <div className="h-px bg-app-border" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop top bar */}
        <div className="hidden md:block">
          <AppTopBar />
          <div className="h-px bg-app-border" />
        </div>

        <main className="flex-1 overflow-x-hidden">{children}</main>

        {/* Mobile bottom nav */}
        <div className="md:hidden mt-auto">
          <div className="h-px bg-app-border" />
          <MobileNavBar />
        </div>
      </div>
    </div>
  );
}
