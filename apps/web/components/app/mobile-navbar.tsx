"use client";

import * as React from "react";
import {
  ActivityLogIcon,
  ArchiveIcon,
  DashboardIcon,
  DotsHorizontalIcon,
  GroupIcon
} from "@radix-ui/react-icons";
import { MobileNavItem } from "./mobile-nav-item";

export function MobileNavBar() {
  return (
    <nav className="flex h-[58px] items-stretch bg-app-sidebar px-1.5 pt-1.5 pb-1.5">
      <MobileNavItem label="Home" href="/" icon={<DashboardIcon />} />
      <MobileNavItem label="Runs" href="/runs" icon={<ActivityLogIcon />} />
      <MobileNavItem label="Agents" href="/agents" icon={<GroupIcon />} />
      <MobileNavItem label="Files" href="/artifacts" icon={<ArchiveIcon />} />
      <MobileNavItem
        label="More"
        href="/miro"
        icon={<DotsHorizontalIcon />}
        matchPrefixes={["/approvals"]}
      />
    </nav>
  );
}
