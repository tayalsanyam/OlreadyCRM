"use client";

import {
  ADMIN_MUA_SEGMENT_LABELS,
  type AdminMuaPipelineFilter,
  type AdminMuaSalesRmFilter,
  type AdminMuaSegment,
} from "@/lib/admin-muas-query";
import { cn } from "@/lib/utils";

export type AdminMuasQuickView = {
  salesRm: AdminMuaSalesRmFilter;
  pipeline: AdminMuaPipelineFilter;
  segment: AdminMuaSegment | "all";
};

type Props = {
  value: AdminMuasQuickView;
  onChange: (next: AdminMuasQuickView) => void;
  counts: {
    needsSalesRm: number;
    missingPipeline: number;
  };
};

function Chip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-brand text-white shadow-sm"
          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
      )}
    >
      {children}
      {count != null && count > 0 ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
            active ? "bg-white/20" : "bg-amber-100 text-amber-900",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function AdminMuasQuickViews({ value, onChange, counts }: Props) {
  const isAll =
    value.salesRm === "all" && value.pipeline === "all" && value.segment === "all";

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-brand">Quick views</p>
        <p className="mt-0.5 text-xs text-slate-muted">
          All MUAs live here. Filter by salesperson assignment and segment (Potential, Customer, On
          plan). New imports and Add MUA always create a sales pipeline.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip
          active={isAll}
          onClick={() => onChange({ salesRm: "all", pipeline: "all", segment: "all" })}
        >
          All MUAs
        </Chip>
        <Chip
          active={value.salesRm === "unassigned" && value.pipeline === "all"}
          count={counts.needsSalesRm}
          onClick={() =>
            onChange({ salesRm: "unassigned", pipeline: "all", segment: value.segment })
          }
        >
          Needs Sales RM
        </Chip>
        <Chip
          active={value.pipeline === "missing"}
          count={counts.missingPipeline}
          onClick={() =>
            onChange({ salesRm: "all", pipeline: "missing", segment: value.segment })
          }
        >
          No pipeline
        </Chip>
        <Chip
          active={value.salesRm === "assigned"}
          onClick={() =>
            onChange({ salesRm: "assigned", pipeline: "all", segment: value.segment })
          }
        >
          Has Sales RM
        </Chip>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Segment</span>
        {(
          [
            ["all", "All segments"],
            ["potential", ADMIN_MUA_SEGMENT_LABELS.potential],
            ["customer", ADMIN_MUA_SEGMENT_LABELS.customer],
            ["plan_customer", ADMIN_MUA_SEGMENT_LABELS.plan_customer],
          ] as const
        ).map(([id, label]) => (
          <Chip
            key={id}
            active={value.segment === id}
            onClick={() =>
              onChange({
                salesRm: value.salesRm,
                pipeline: value.pipeline,
                segment: id,
              })
            }
          >
            {label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
