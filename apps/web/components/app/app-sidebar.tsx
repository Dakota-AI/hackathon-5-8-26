"use client";

import * as React from "react";
import {
  ActivityLogIcon,
  ArchiveIcon,
  CheckCircledIcon,
  Component1Icon,
  DashboardIcon,
  GroupIcon
} from "@radix-ui/react-icons";
import { BrandHeader } from "./brand-header";
import { ConnectionCard } from "./connection-card";
import { NavButton } from "./nav-button";

const navItems = [
  { label: "Command Center", href: "/", icon: <DashboardIcon />, exact: true },
  { label: "Runs", href: "/runs", icon: <ActivityLogIcon /> },
  { label: "Agents & Teams", href: "/agents", icon: <GroupIcon /> },
  { label: "Artifacts", href: "/artifacts", icon: <ArchiveIcon /> },
  { label: "Miro Boards", href: "/miro", icon: <Component1Icon /> },
  { label: "Approvals", href: "/approvals", icon: <CheckCircledIcon /> }
];

export function AppSidebar() {
  return (
    <aside className="flex h-screen w-[236px] shrink-0 flex-col bg-app-sidebar pl-3 pr-3 pt-3 pb-2.5">
      <BrandHeader />
      <div className="my-3.5 h-px bg-app-border" />
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <NavButton key={item.href} {...item} />
        ))}
      </nav>
      <div className="flex-1" />
      <ConnectionCard />
    </aside>
  );
}
