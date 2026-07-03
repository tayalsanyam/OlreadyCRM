import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type BadgeVariant =
  | "default"
  | "critical"
  | "hot"
  | "active"
  | "longShelf"
  | "tier1"
  | "tier2"
  | "tier3"
  | "tier4"
  | "success"
  | "muted";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const styles: Record<BadgeVariant, string> = {
  default: "bg-brand/10 text-brand",
  critical: "bg-red-100 text-red-800",
  hot: "bg-orange-100 text-orange-800",
  active: "bg-yellow-100 text-yellow-800",
  longShelf: "bg-slate-200 text-slate-700",
  tier1: "bg-purple-100 text-purple-800",
  tier2: "bg-indigo-100 text-indigo-800",
  tier3: "bg-blue-100 text-blue-800",
  tier4: "bg-slate-100 text-slate-600",
  success: "bg-emerald-100 text-emerald-800",
  muted: "bg-slate-100 text-slate-muted",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
