"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import {
  rmMatchesRegion,
  type CommissionRmOption,
  type RmOption,
} from "@/components/admin/assign-workspace/assign-types";
import {
  BUDGET_TIER_LABELS,
  LEAD_STATUS_LABELS,
  URGENCY_LABELS,
  type LeadFull,
} from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const URGENCY_BORDER: Record<string, string> = {
  critical: "border-l-red-500",
  hot: "border-l-orange-500",
  active: "border-l-yellow-400",
  longShelf: "border-l-slate-400",
};

const SELECT_CLASS =
  "min-w-[5.5rem] max-w-[7.5rem] flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] leading-tight";

function CompactBtn(props: ComponentProps<typeof Button>) {
  return (
    <Button
      size="sm"
      className="h-6 shrink-0 px-2 py-0 text-[11px] leading-none"
      {...props}
    />
  );
}

interface ActionsProps {
  lead: LeadFull & { assignedRmName?: string | null };
  reassignRm: Record<string, string>;
  reassignCommissionRm: Record<string, string>;
  rms: RmOption[];
  commissionRms: CommissionRmOption[];
  onReassignRmChange: (leadId: string, rmId: string) => void;
  onReassignCommissionRmChange: (leadId: string, rmId: string) => void;
  onReassign: (leadId: string, target: "rm" | "commission" | "portal") => void;
}

function AssignedLeadActions({
  lead,
  reassignRm,
  reassignCommissionRm,
  rms,
  commissionRms,
  onReassignRmChange,
  onReassignCommissionRmChange,
  onReassign,
}: ActionsProps) {
  const isRegional = lead.status === "assigned" || lead.status === "booked";
  const isCommission = lead.status === "commissionRm";

  return (
    <div className="flex max-w-[11rem] flex-col gap-0.5">
      {isRegional ? (
        <div className="flex items-center gap-1">
          <select
            className={SELECT_CLASS}
            value={reassignRm[lead.id] ?? ""}
            onChange={(e) => onReassignRmChange(lead.id, e.target.value)}
            aria-label="Regional RM"
          >
            <option value="">RM…</option>
            {rms
              .filter((r) => rmMatchesRegion(r, lead.region))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
          <CompactBtn
            variant="secondary"
            disabled={!reassignRm[lead.id]}
            title="Reassign regional RM"
            onClick={() => onReassign(lead.id, "rm")}
          >
            RM
          </CompactBtn>
        </div>
      ) : null}
      {isRegional || isCommission ? (
        <div className="flex items-center gap-1">
          <select
            className={SELECT_CLASS}
            value={reassignCommissionRm[lead.id] ?? ""}
            onChange={(e) => onReassignCommissionRmChange(lead.id, e.target.value)}
            aria-label="Commission RM"
          >
            <option value="">Comm…</option>
            {commissionRms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <CompactBtn
            variant="secondary"
            disabled={!reassignCommissionRm[lead.id]}
            title={isCommission ? "Reassign commission RM" : "Move to commission"}
            onClick={() => onReassign(lead.id, "commission")}
          >
            Comm
          </CompactBtn>
        </div>
      ) : null}
      <CompactBtn
        variant="ghost"
        className="h-6 w-fit px-1.5"
        title="Mark portal-only"
        onClick={() => onReassign(lead.id, "portal")}
      >
        Portal
      </CompactBtn>
    </div>
  );
}

interface Props {
  leads: (LeadFull & { assignedRmName?: string | null })[];
  reassignRm: Record<string, string>;
  reassignCommissionRm: Record<string, string>;
  rms: RmOption[];
  commissionRms: CommissionRmOption[];
  onReassignRmChange: (leadId: string, rmId: string) => void;
  onReassignCommissionRmChange: (leadId: string, rmId: string) => void;
  onReassign: (leadId: string, target: "rm" | "commission" | "portal") => void;
}

export function AssignedLeadsTable({
  leads,
  reassignRm,
  reassignCommissionRm,
  rms,
  commissionRms,
  onReassignRmChange,
  onReassignCommissionRmChange,
  onReassign,
}: Props) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Lead</TH>
          <TH>Phone</TH>
          <TH>Assigned RM</TH>
          <TH>Status</TH>
          <TH>Event date</TH>
          <TH>Last activity</TH>
          <TH className="w-[11rem]">Actions</TH>
        </TR>
      </THead>
      <TBody>
        {leads.length === 0 ? (
          <TR>
            <TD colSpan={7} className="py-8 text-center text-slate-muted">
              No assigned leads match these filters
            </TD>
          </TR>
        ) : (
          leads.map((lead) => {
            const borderClass = URGENCY_BORDER[lead.urgencyBand] ?? "border-l-slate-300";
            return (
              <TR key={lead.id} className={cn("border-l-4 align-top", borderClass)}>
                <TD className="py-2">
                  <Link
                    href={`/rm/leads/${lead.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {lead.brideName}
                  </Link>
                  <p className="text-xs text-slate-muted">{lead.displayId}</p>
                  <p className="text-xs capitalize text-slate-muted">
                    {lead.city}
                    {lead.region ? ` · ${lead.region}` : ""}
                  </p>
                </TD>
                <TD className="py-2 text-sm whitespace-nowrap">{lead.phone}</TD>
                <TD className="py-2 text-sm">{lead.assignedRmName ?? "—"}</TD>
                <TD className="py-2">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="default">
                      {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
                    </Badge>
                    <Badge variant={lead.urgencyBand}>{URGENCY_LABELS[lead.urgencyBand]}</Badge>
                    <Badge variant="muted">{BUDGET_TIER_LABELS[lead.budgetTier]}</Badge>
                  </div>
                </TD>
                <TD className="py-2 text-sm whitespace-nowrap">{formatDate(lead.eventDate)}</TD>
                <TD className="py-2 text-sm whitespace-nowrap">
                  {lead.lastActivityAt ? formatDate(lead.lastActivityAt.slice(0, 10)) : "—"}
                </TD>
                <TD className="py-2">
                  <AssignedLeadActions
                    lead={lead}
                    reassignRm={reassignRm}
                    reassignCommissionRm={reassignCommissionRm}
                    rms={rms}
                    commissionRms={commissionRms}
                    onReassignRmChange={onReassignRmChange}
                    onReassignCommissionRmChange={onReassignCommissionRmChange}
                    onReassign={onReassign}
                  />
                </TD>
              </TR>
            );
          })
        )}
      </TBody>
    </Table>
  );
}
