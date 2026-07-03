"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  {
    href: "/admin/activation/overview",
    label: "Activation Overview",
    match: (p: string) => p.startsWith("/admin/activation/overview"),
  },
  {
    href: "/admin/sales/activation",
    label: "Activation",
    match: (p: string) =>
      p === "/admin/sales/activation" || p.startsWith("/admin/sales/activation/"),
  },
] as const;

export function AdminActivationNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
      aria-label="Activation admin"
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
