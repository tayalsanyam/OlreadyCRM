"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { LeadQuickContact } from "@/components/leads/LeadQuickContact";
import {
  rmMatchesRegion,
  type CommissionRmOption,
  type RmOption,
} from "@/components/admin/assign-workspace/assign-types";
import { LEAD_EXIT_LABELS } from "@/lib/lead-exit";
import { BUDGET_TIER_LABELS, type BrideLead } from "@/lib/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

interface Props {
  leads: BrideLead[];
  selected: Set<string>;
  assignRm: Record<string, string>;
  bulkRmId: string;
  rms: RmOption[];
  commissionRms: CommissionRmOption[];
  onSelect: (leadId: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onBulkRmChange: (value: string) => void;
  onBulkAssign: () => void;
  onAssignChoiceChange: (leadId: string, value: string) => void;
  onAssign: (leadId: string) => void;
  onCloseLead: (lead: BrideLead) => void;
}

export function UnassignedLeadsTable({
  leads,
  selected,
  assignRm,
  bulkRmId,
  rms,
  commissionRms,
  onSelect,
  onSelectAll,
  onBulkRmChange,
  onBulkAssign,
  onAssignChoiceChange,
  onAssign,
  onCloseLead,
}: Props) {
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const bulkReady =
    selected.size > 0 && bulkRmId && bulkRmId !== "portal";

  return (
    <div className="space-y-3">
      {leads.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-xs text-slate-muted">
            {selected.size} selected
          </span>
          <select
            className="rounded border border-slate-200 px-2 py-1 text-xs"
            value={bulkRmId}
            onChange={(e) => onBulkRmChange(e.target.value)}
          >
            <option value="">Bulk assign…</option>
            {rms.map((r) => (
              <option key={r.id} value={r.id}>
                RM: {r.name}
              </option>
            ))}
            {commissionRms.map((c) => (
              <option key={c.id} value={`commission:${c.id}`}>
                Commission: {c.name}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={!bulkReady} onClick={onBulkAssign}>
            Assign selected
          </Button>
        </div>
      ) : null}

      <Table>
        <THead>
          <TR>
            <TH className="w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onSelectAll(e.target.checked)}
                aria-label="Select all leads"
              />
            </TH>
            <TH>Lead</TH>
            <TH>Phone</TH>
            <TH>Location</TH>
            <TH>Budget</TH>
            <TH>Event date</TH>
            <TH>Verified</TH>
            <TH>Contact</TH>
            <TH className="min-w-[12rem]">Assign</TH>
          </TR>
        </THead>
        <TBody>
          {leads.length === 0 ? (
            <TR>
              <TD colSpan={9} className="py-8 text-center text-slate-muted">
                No unassigned leads match these filters
              </TD>
            </TR>
          ) : (
            leads.map((lead) => {
              const assignChoice = assignRm[lead.id] ?? "";
              return (
                <TR
                  key={lead.id}
                  className={cn(
                    selected.has(lead.id) && "bg-accent/5",
                    lead.portalOnly && "border-l-4 border-l-purple-400"
                  )}
                >
                  <TD>
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={(e) => onSelect(lead.id, e.target.checked)}
                      aria-label={`Select ${lead.brideName}`}
                    />
                  </TD>
                  <TD>
                    <Link
                      href={`/rm/leads/${lead.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {lead.brideName}
                    </Link>
                    <p className="text-xs text-slate-muted">{lead.displayId}</p>
                    {lead.portalOnly ? (
                      <Badge className="mt-1 bg-purple-100 text-purple-800">Portal</Badge>
                    ) : null}
                    {lead.source ? (
                      <p className="text-xs text-slate-muted">Source: {lead.source}</p>
                    ) : null}
                  </TD>
                  <TD className="text-sm whitespace-nowrap">{lead.phone}</TD>
                  <TD className="text-sm">
                    {lead.city}
                    <span className="block text-xs capitalize text-slate-muted">
                      {lead.region ?? "—"}
                    </span>
                  </TD>
                  <TD className="text-sm whitespace-nowrap">
                    {BUDGET_TIER_LABELS[lead.budgetTier]}
                    {lead.budgetAmount != null ? (
                      <span className="block text-xs text-slate-muted">
                        Rs. {Number(lead.budgetAmount).toLocaleString("en-IN")}
                      </span>
                    ) : null}
                  </TD>
                  <TD className="text-sm whitespace-nowrap">{formatDate(lead.eventDate)}</TD>
                  <TD className="text-sm whitespace-nowrap">
                    {lead.verifiedAt ? formatDateTime(lead.verifiedAt) : "—"}
                  </TD>
                  <TD>
                    <LeadQuickContact
                      leadId={lead.id}
                      brideName={lead.brideName}
                      phone={lead.phone}
                      city={lead.city}
                      variant="compact"
                    />
                  </TD>
                  <TD>
                    <div className="flex flex-col gap-1">
                      <select
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                        value={assignChoice}
                        onChange={(e) => onAssignChoiceChange(lead.id, e.target.value)}
                      >
                        <option value="">Choose routing…</option>
                        {rms
                          .filter((r) => rmMatchesRegion(r, lead.region))
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              RM: {r.name}
                            </option>
                          ))}
                        {commissionRms.map((c) => (
                          <option key={c.id} value={`commission:${c.id}`}>
                            Commission: {c.name}
                          </option>
                        ))}
                        <option value="portal">Portal only</option>
                      </select>
                      <Button size="sm" disabled={!assignChoice} onClick={() => onAssign(lead.id)}>
                        Assign
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-700 hover:bg-red-50"
                        onClick={() => onCloseLead(lead)}
                      >
                        {LEAD_EXIT_LABELS.closeLead}
                      </Button>
                    </div>
                  </TD>
                </TR>
              );
            })
          )}
        </TBody>
      </Table>
    </div>
  );
}
