"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  {
    href: "/admin/muas",
    label: "Manage MUAs",
    match: (p: string, tab: string | null) =>
      p === "/admin/muas" && tab !== "plans",
  },
  {
    href: "/admin/muas?tab=plans",
    label: "Plan Assignment",
    match: (p: string, tab: string | null) =>
      p === "/admin/muas" && tab === "plans",
  },
] as const;

export function AdminMuasNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  return (
    <nav
      className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
      aria-label="MUA admin"
    >
      {TABS.map((item) => {
        const active = item.match(pathname, tab);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
