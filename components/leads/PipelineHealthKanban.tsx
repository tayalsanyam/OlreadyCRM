"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { LeadFull, PipelineHealthBucket, PipelineHealthLead } from "@/lib/types";
import { BUDGET_TIER_LABELS, URGENCY_LABELS } from "@/lib/types";

const COLUMNS: {
  bucket: PipelineHealthBucket;
  label: string;
  border: string;
  header: string;
}[] = [
  { bucket: "none", label: "Not Started", border: "border-slate-300", header: "bg-slate-100" },
  { bucket: "1-5", label: "Early Stage", border: "border-blue-400", header: "bg-blue-50" },
  { bucket: "6-10", label: "Mid Stage", border: "border-teal-500", header: "bg-teal-50" },
  { bucket: "11-15", label: "Well Worked", border: "border-emerald-500", header: "bg-emerald-50" },
  { bucket: "16+", label: "Exhausted", border: "border-amber-500", header: "bg-amber-50" },
];

interface PipelineHealthKanbanProps {
  leads: PipelineHealthLead[];
  loading?: boolean;
}

function HealthCard({ lead }: { lead: PipelineHealthLead }) {
  const critical = lead.urgencyBand === "critical" || lead.urgencyBand === "hot";
  return (
    <Link
      href={`/rm/leads/${lead.id}`}
      className={cn(
        "block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md",
        critical && lead.daysToEvent <= 30 && "ring-1 ring-red-200"
      )}
    >
      <p className="font-medium text-brand">{lead.brideName}</p>
      <p className="text-[10px] font-mono text-slate-muted">{lead.displayId}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge variant={lead.urgencyBand}>{URGENCY_LABELS[lead.urgencyBand]}</Badge>
        <Badge variant="muted">{BUDGET_TIER_LABELS[lead.budgetTier]}</Badge>
      </div>
      <p
        className={cn(
          "mt-2 text-xs",
          lead.daysToEvent <= 30 ? "font-semibold text-red-600" : "text-slate-muted"
        )}
      >
        {lead.daysToEvent}d to event
      </p>
      <p className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
        {lead.muasOfferedCount} MUAs offered
      </p>
      {lead.assignedRmName && (
        <p className="mt-1 text-[10px] text-slate-muted">{lead.assignedRmName}</p>
      )}
    </Link>
  );
}

export function PipelineHealthKanban({ leads, loading }: PipelineHealthKanbanProps) {
  const noneColRef = useRef<HTMLDivElement>(null);

  const grouped = useMemo(() => {
    const map: Record<PipelineHealthBucket, PipelineHealthLead[]> = {
      none: [],
      "1-5": [],
      "6-10": [],
      "11-15": [],
      "16+": [],
    };
    for (const l of leads) {
      map[l.bucket].push(l);
    }
    return map;
  }, [leads]);

  const alertCount = useMemo(() => {
    return grouped.none.filter(
      (l) => l.urgencyBand === "critical" || l.urgencyBand === "hot"
    ).length;
  }, [grouped.none]);

  if (loading) {
    return <div className="mt-4 h-48 animate-pulse rounded-xl bg-slate-200" />;
  }

  return (
    <div className="space-y-4">
      {alertCount > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          ⚠ {alertCount} Critical/Hot lead{alertCount > 1 ? "s" : ""} have received no MUA
          offers.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() =>
              noneColRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
            }
          >
            Jump to Not Started
          </button>
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colLeads = grouped[col.bucket];
          const criticalHot = colLeads.filter(
            (l) => l.urgencyBand === "critical" || l.urgencyBand === "hot"
          ).length;

          return (
            <div
              key={col.bucket}
              ref={col.bucket === "none" ? noneColRef : undefined}
              className={cn(
                "flex min-w-[260px] max-w-[300px] flex-1 flex-col rounded-lg border-2 bg-white",
                col.border
              )}
            >
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5",
                  col.header
                )}
              >
                <h3 className="text-sm font-semibold text-brand">
                  {col.label}{" "}
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs">
                    {colLeads.length}
                  </span>
                </h3>
                {criticalHot > 0 && (
                  <span className="text-[10px] font-medium text-red-700">
                    ⚠ {criticalHot} Critical/Hot
                  </span>
                )}
              </div>
              <div className="flex max-h-[calc(100vh-280px)] flex-col gap-2 overflow-y-auto p-2">
                {colLeads.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-muted">Empty</p>
                ) : (
                  colLeads.map((lead) => <HealthCard key={lead.id} lead={lead} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
