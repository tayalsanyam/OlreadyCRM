"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import {
  EXIT_MARKED_BY_LABELS,
  LEAD_EXIT_LABELS,
  type ExitMarkedByRole,
} from "@/lib/lead-exit";
import { BUDGET_TIER_LABELS, type BrideLead } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { MAX_VERIFICATION_CONNECT_ATTEMPTS } from "@/lib/lead-uploader-config";

export type AssignUploadLeadRow = BrideLead & {
  eventCount?: number;
  ceremonies?: string | null;
  portalOnly?: boolean;
  handoverReason?: string | null;
  assignedRmName?: string | null;
};

function reviewExitNote(l: AssignUploadLeadRow): string {
  if (l.hostileNote?.trim()) return l.hostileNote.trim();
  return l.handoverReason?.trim() || "—";
}

function exitMarkedByLabel(role: string | null | undefined): string | null {
  if (!role || !(role in EXIT_MARKED_BY_LABELS)) return null;
  return EXIT_MARKED_BY_LABELS[role as ExitMarkedByRole];
}

interface Props {
  tab: "review" | "closed";
  leads: AssignUploadLeadRow[];
  onReverify: (lead: AssignUploadLeadRow) => void;
  onClose: (lead: AssignUploadLeadRow) => void;
  onReactivate: (lead: AssignUploadLeadRow) => void;
  onHistory: (lead: AssignUploadLeadRow) => void;
  onNote: (lead: AssignUploadLeadRow) => void;
}

export function ReviewClosedLeadsTable({
  tab,
  leads,
  onReverify,
  onClose,
  onReactivate,
  onHistory,
  onNote,
}: Props) {
  const isReview = tab === "review";

  return (
    <Table>
      <THead>
        <TR>
          <TH>Lead</TH>
          <TH>Phone</TH>
          <TH>Location</TH>
          <TH>Event date</TH>
          <TH>Ceremonies</TH>
          <TH>Budget</TH>
          <TH>Status</TH>
          {isReview ? <TH>Exit note</TH> : <TH>Closure reason</TH>}
          <TH>Added</TH>
          <TH />
        </TR>
      </THead>
      <TBody>
        {leads.length === 0 ? (
          <TR>
            <TD colSpan={isReview ? 10 : 10} className="py-8 text-center text-slate-muted">
              No leads in this tab
            </TD>
          </TR>
        ) : (
          leads.map((l) => (
            <TR key={l.id} className="align-top hover:bg-slate-50/80">
              <TD>
                <p className="font-medium">{l.brideName}</p>
                <p className="text-xs font-mono text-slate-muted">{l.displayId}</p>
              </TD>
              <TD className="text-sm whitespace-nowrap">{l.phone}</TD>
              <TD className="text-sm">
                {l.city}
                <span className="block text-xs capitalize text-slate-muted">
                  {l.region ?? "—"}
                </span>
                {l.eventLocation ? (
                  <span className="block text-xs text-slate-muted">{l.eventLocation}</span>
                ) : null}
              </TD>
              <TD className="text-sm whitespace-nowrap">{formatDate(l.eventDate)}</TD>
              <TD className="max-w-[140px] text-xs text-slate-muted">
                {l.ceremonies ?? (l.eventCount ? `${l.eventCount} event(s)` : "—")}
              </TD>
              <TD className="text-sm">
                <span className="font-medium">
                  {BUDGET_TIER_LABELS[l.budgetTier] ?? l.budgetTier}
                </span>
                {l.budgetAmount != null ? (
                  <span className="block text-xs text-slate-muted">
                    Rs. {Number(l.budgetAmount).toLocaleString("en-IN")}
                  </span>
                ) : null}
              </TD>
              <TD>
                {isReview ? (
                  <Badge className="bg-red-100 text-red-800">
                    {LEAD_EXIT_LABELS.uploaderReview}
                  </Badge>
                ) : (
                  <Badge className="bg-slate-200 text-slate-800">{LEAD_EXIT_LABELS.closed}</Badge>
                )}
                {(l.verificationConnectAttempts ?? 0) > 0 && isReview ? (
                  <span className="mt-1 block text-xs text-slate-muted">
                    Connect attempts: {l.verificationConnectAttempts}/
                    {MAX_VERIFICATION_CONNECT_ATTEMPTS}
                  </span>
                ) : null}
              </TD>
              {isReview ? (
                <TD className="max-w-[240px] text-xs text-slate-800">
                  {exitMarkedByLabel(l.exitMarkedByRole) ? (
                    <Badge variant="muted" className="mb-1">
                      {exitMarkedByLabel(l.exitMarkedByRole)}
                    </Badge>
                  ) : null}
                  <div>{reviewExitNote(l)}</div>
                </TD>
              ) : (
                <TD className="max-w-[240px] text-xs text-slate-700">
                  {l.handoverReason ?? "—"}
                </TD>
              )}
              <TD className="text-xs text-slate-muted whitespace-nowrap">
                {l.createdAt ? formatDate(l.createdAt) : "—"}
              </TD>
              <TD>
                <div className="flex min-w-[8rem] flex-col gap-1">
                  {isReview ? (
                    <>
                      <Button size="sm" onClick={() => onReverify(l)}>
                        Re-verify
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => onClose(l)}>
                        {LEAD_EXIT_LABELS.closeLead}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onHistory(l)}>
                        History
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => onReactivate(l)}>
                        {LEAD_EXIT_LABELS.reactivate}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => onHistory(l)}>
                        History
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onNote(l)}>
                        Add note
                      </Button>
                    </>
                  )}
                </div>
              </TD>
            </TR>
          ))
        )}
      </TBody>
    </Table>
  );
}

export { reviewExitNote };
