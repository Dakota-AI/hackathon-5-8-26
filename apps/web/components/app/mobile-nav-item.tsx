"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../../lib/utils";

type MobileNavItemProps = {
  label: string;
  href: string;
  icon: React.ReactNode;
  matchPrefixes?: string[];
};

export function MobileNavItem({ label, href, icon, matchPrefixes }: MobileNavItemProps) {
  const pathname = usePathname() ?? "";
  const active =
    pathname === href ||
    (href !== "/" && pathname.startsWith(`${href}/`)) ||
    (matchPrefixes ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <Link
      href={href}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-[3px] rounded-[10px] py-1.5 mx-0.5",
        "border transition-colors",
        active
          ? "bg-app-input border-app-border text-app-text"
          : "border-transparent text-app-muted hover:text-app-text"
      )}
    >
      <span className="flex h-4 w-4 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <span className={cn("text-[10px]", active ? "font-extrabold" : "font-semibold")}>{label}</span>
    </Link>
  );
}
