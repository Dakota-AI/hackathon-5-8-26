"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../../lib/utils";

type NavButtonProps = {
  label: string;
  href: string;
  icon: React.ReactNode;
  exact?: boolean;
};

export function NavButton({ label, href, icon, exact }: NavButtonProps) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2.5 rounded-[8px] px-2.5 py-2",
        "text-[13px] font-semibold transition-colors",
        active
          ? "bg-app-input text-app-text border border-app-border"
          : "text-app-muted hover:text-app-text hover:bg-app-input/60 border border-transparent"
      )}
    >
      <span className="flex h-[17px] w-[17px] items-center justify-center [&_svg]:h-[17px] [&_svg]:w-[17px]">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
