import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatDate, cn } from "@/lib/utils";
import type { LeadFull } from "@/lib/types";
import {
  formatEventsBudgetLine,
  formatMuasOfferedLine,
  getLeadStatusLabel,
} from "@/lib/lead-status";
import { BUDGET_TIER_LABELS, URGENCY_LABELS } from "@/lib/types";

const TIER_BADGE: Record<string, "tier1" | "tier2" | "tier3" | "tier4"> = {
  tier_1: "tier1",
  tier_2: "tier2",
  tier_3: "tier3",
  tier_4: "tier4",
  tier1: "tier1",
  tier2: "tier2",
  tier3: "tier3",
  tier4: "tier4",
};

const URGENCY_BORDER: Record<string, string> = {
  critical: "border-l-red-500",
  hot: "border-l-orange-500",
  active: "border-l-yellow-400",
  longShelf: "border-l-slate-400",
};

interface LeadCardProps {
  lead: LeadFull;
  href?: string;
  handoverReason?: string | null;
  footer?: ReactNode;
  /** Hide RM assignment window countdown (Commission RM). */
  hideAssignmentWindow?: boolean;
}

export function LeadCard({
  lead,
  href,
  handoverReason,
  footer,
  hideAssignmentWindow = false,
}: LeadCardProps) {
  const reason = handoverReason ?? lead.handoverReason;
  const tierKey = String(lead.budgetTier);
  const tierLabel =
    BUDGET_TIER_LABELS[lead.budgetTier as keyof typeof BUDGET_TIER_LABELS] ??
    tierKey;
  const borderClass =
    URGENCY_BORDER[lead.urgencyBand] ?? "border-l-slate-300";

  const daysToEventClass =
    lead.urgencyBand === "critical"
      ? "font-bold text-red-600"
      : lead.urgencyBand === "hot"
        ? "font-bold text-orange-600"
        : "text-text";

  const windowUrgent =
    lead.assignmentDaysRemaining !== null &&
    lead.assignmentDaysRemaining <= 10;

  const inner = (
      <article
        className={cn(
          "rounded-lg border border-slate-200 bg-white border-l-4 pl-4 pr-4 py-3.5",
          href && "transition-all duration-200 group-hover:shadow-md group-hover:border-accent/60",
          borderClass
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-brand truncate">
              {lead.brideName}
            </h3>
            <p className="text-xs text-slate-muted">{lead.displayId}</p>
            <p className="mt-1 text-sm text-slate-muted truncate">
              {lead.city}
              {lead.eventLocation ? ` · ${lead.eventLocation}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Badge variant="muted">{getLeadStatusLabel(lead)}</Badge>
            <Badge variant={lead.urgencyBand}>
              {URGENCY_LABELS[lead.urgencyBand]}
            </Badge>
            <Badge variant={TIER_BADGE[tierKey] ?? "default"}>{tierLabel}</Badge>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-muted">
          <span className={daysToEventClass}>
            🗓 {lead.daysToEvent}d to event
          </span>
          {lead.assignmentDaysRemaining !== null && !hideAssignmentWindow && (
            <span className={cn(windowUrgent && "font-bold text-amber-600")}>
              ⏱ {lead.assignmentDaysRemaining}d left in window
            </span>
          )}
          <span>{formatEventsBudgetLine(lead)}</span>
          <span className="truncate max-w-full" title={lead.muasOfferedNames ?? undefined}>
            👤 {formatMuasOfferedLine(lead)}
          </span>
          {lead.lastActivityAt && (
            <span>
              📅 Last: {formatDate(lead.lastActivityAt.slice(0, 10))}
            </span>
          )}
          {lead.portalPushed && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              🌐 Portal
            </span>
          )}
        </div>

        {reason && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            Handover: {reason}
          </div>
        )}
      </article>
  );

  return (
    <div className="space-y-2">
      {href ? (
        <Link href={href} className="block group">
          {inner}
        </Link>
      ) : (
        inner
      )}
      {footer}
    </div>
  );
}
