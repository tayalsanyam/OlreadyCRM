"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type StaffMuasTabsVariant = "feedback" | "care";

const TABS: Record<
  StaffMuasTabsVariant,
  { href: string; label: string; match: (p: string) => boolean }[]
> = {
  feedback: [
    {
      href: "/feedback/muas",
      label: "MUA database",
      match: (p) => p === "/feedback/muas",
    },
    {
      href: "/feedback/muas/add",
      label: "Add MUA",
      match: (p) => p.startsWith("/feedback/muas/add"),
    },
  ],
  care: [
    {
      href: "/care/muas",
      label: "MUA lookup",
      match: (p) => p === "/care/muas",
    },
    {
      href: "/care/muas/add",
      label: "Add MUA",
      match: (p) => p.startsWith("/care/muas/add"),
    },
  ],
};

export function StaffMuasTabs({ variant }: { variant: StaffMuasTabsVariant }) {
  const pathname = usePathname();
  const tabs = TABS[variant];

  return (
    <nav
      className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
      aria-label="MUA tools"
    >
      {tabs.map((tab) => {
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
