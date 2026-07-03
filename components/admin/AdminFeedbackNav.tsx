"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  {
    href: "/admin/feedback/overview",
    label: "Feedback Overview",
    match: (p: string) => p.startsWith("/admin/feedback/overview"),
  },
  {
    href: "/admin/feedback",
    label: "Lead Feedback",
    match: (p: string) => p === "/admin/feedback",
  },
  {
    href: "/admin/feedback/reports",
    label: "Feedback Reports",
    match: (p: string) => p.startsWith("/admin/feedback/reports"),
  },
  {
    href: "/admin/feedback-referrals",
    label: "Feedback Referrals",
    match: (p: string) =>
      p === "/admin/feedback-referrals" || p.startsWith("/admin/feedback-referrals/"),
  },
] as const;

export function AdminFeedbackNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
      aria-label="Feedback admin"
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
