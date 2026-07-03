"use client";

import { cn } from "@/lib/utils";

export function ReportSummaryChips({
  children,
  title,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      {title ? <p className="mb-3 text-sm font-medium text-brand">{title}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">{children}</div>
    </div>
  );
}

export function ReportSummaryChip({
  label,
  value,
  active,
  onClick,
  tone = "default",
}: {
  label: string;
  value: string | number;
  active?: boolean;
  onClick?: () => void;
  tone?: "default" | "warn" | "danger";
}) {
  const body = (
    <>
      <p className="text-xs text-slate-muted">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold",
          tone === "danger" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-brand"
        )}
      >
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </p>
    </>
  );

  if (!onClick) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">{body}</div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-left transition-colors",
        active ? "border-brand bg-brand/5" : "border-slate-200 bg-white hover:border-slate-300"
      )}
    >
      {body}
    </button>
  );
}

export function ReportResultLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-muted">{children}</p>;
}
