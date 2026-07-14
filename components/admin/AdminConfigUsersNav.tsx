"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/config", label: "Config", match: (p: string) => p === "/admin/config" },
  {
    href: "/admin/users",
    label: "Users",
    match: (p: string) => p === "/admin/users",
  },
  {
    href: "/admin/users/teams",
    label: "Sales teams",
    match: (p: string) => p.startsWith("/admin/users/teams"),
  },
] as const;

export function AdminConfigUsersNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
      aria-label="Config and users"
    >
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
