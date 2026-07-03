"use client";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { Booking, CommEntry, LeadEvent, MuaPushWithDetails } from "@/lib/types";
import {
  MUA_PUSH_STAGE_LABELS,
  MUA_PUSH_STATUS_LABELS,
  PLAN_TIER_LABELS,
} from "@/lib/types";
import {
  commissionCollectionStage,
  commissionOutstanding,
  COMMISSION_COLLECTION_STAGE_LABELS,
} from "@/lib/commission-booking";
import { cn } from "@/lib/utils";

interface CommissionSplitViewProps {
  shiftedAt: string | null;
  comms: CommEntry[];
  pushes: MuaPushWithDetails[];
  bookings: Booking[];
  events?: LeadEvent[];
}

export function CommissionSplitView({
  shiftedAt,
  comms,
  pushes,
  bookings,
  events = [],
}: CommissionSplitViewProps) {
  const shift = shiftedAt ? new Date(shiftedAt) : null;

  const eventNameById = new Map(events.map((e) => [e.id, e.ceremonyType]));

  const rmComms = shift
    ? comms.filter((c) => new Date(c.createdAt) < shift)
    : comms;
  const commissionComms = shift
    ? comms.filter((c) => new Date(c.createdAt) >= shift)
    : [];

  const rmPushes = shift
    ? pushes.filter((p) => new Date(p.createdAt) < shift)
    : pushes;
  const commissionPushes = shift
    ? pushes.filter((p) => new Date(p.createdAt) >= shift)
    : [];

  function bookingLabel(b: Booking): string {
    const ceremony =
      eventNameById.get(b.eventId) ?? b.eventId.slice(0, 8);
    const amount = `Rs. ${b.bookedPrice.toLocaleString("en-IN")}`;
    return `${ceremony} — ${amount}`;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <h3 className="font-semibold text-brand">Regional RM phase</h3>
        <p className="text-xs text-slate-muted">
          Activity before commission handover
        </p>
        <div className="max-h-48 space-y-2 overflow-y-auto text-sm">
          {rmComms.length === 0 ? (
            <p className="text-slate-muted">No ledger entries</p>
          ) : (
            rmComms.map((c) => (
              <p key={c.id}>
                <span className="text-xs text-slate-muted">
                  {new Date(c.createdAt).toLocaleDateString("en-IN")}
                </span>
                {" — "}
                {c.description}
              </p>
            ))
          )}
        </div>
        <div className="border-t border-slate-100 pt-2">
          <p className="mb-2 text-xs font-medium text-slate-muted">Plan MUA pushes</p>
          {rmPushes.length === 0 ? (
            <p className="text-sm text-slate-muted">None</p>
          ) : (
            rmPushes.map((p) => (
              <div key={p.id} className="mb-2 flex justify-between text-sm">
                <span>{p.muaName}</span>
                <Badge variant="muted">{MUA_PUSH_STAGE_LABELS[p.stage]}</Badge>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="space-y-3">
        <h3 className="font-semibold text-brand">Commission RM phase</h3>
        <p className="text-xs text-slate-muted">Non-plan / post-handover work</p>
        <div className="max-h-48 space-y-2 overflow-y-auto text-sm">
          {commissionComms.length === 0 ? (
            <p className="text-slate-muted">No entries yet</p>
          ) : (
            commissionComms.map((c) => (
              <p key={c.id}>{c.description}</p>
            ))
          )}
        </div>
        <div className="border-t border-slate-100 pt-2">
          <p className="mb-2 text-xs font-medium text-slate-muted">
            Commission pushes — update stage, close, or quote in the table below
          </p>
          {commissionPushes.length === 0 ? (
            <p className="text-sm text-slate-muted">None yet</p>
          ) : (
            commissionPushes.map((p) => (
              <div
                key={p.id}
                className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="font-medium">{p.muaName}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="muted">{MUA_PUSH_STATUS_LABELS[p.status]}</Badge>
                  <Badge variant="muted">{MUA_PUSH_STAGE_LABELS[p.stage]}</Badge>
                  <span className="text-slate-muted text-xs">
                    {p.planTier ? PLAN_TIER_LABELS[p.planTier] : "Non-plan"}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>
        {bookings.length > 0 && (
          <div className="border-t border-slate-100 pt-2">
            <p className="mb-2 text-xs font-medium text-slate-muted">Bookings</p>
            {bookings
              .filter((b) => !b.cancelled)
              .map((b) => {
                const due = commissionOutstanding(b);
                const stage = commissionCollectionStage(b);
                return (
                  <div
                    key={b.id}
                    className={cn(
                      "mb-2 rounded-md px-2 py-1.5 text-sm",
                      due > 0 && "bg-amber-50 ring-1 ring-amber-200",
                    )}
                  >
                    <p className="font-medium text-brand">{bookingLabel(b)}</p>
                    {b.commissionAmount != null && (
                      <p className="mt-0.5 text-xs text-slate-600">
                        Commission due Rs.{" "}
                        {b.commissionAmount.toLocaleString("en-IN")}
                        {" · "}
                        Received Rs.{" "}
                        {(b.commissionPaid ?? 0).toLocaleString("en-IN")}
                        {due > 0 && (
                          <span className="font-semibold text-amber-800">
                            {" · "}
                            Still due Rs. {due.toLocaleString("en-IN")}
                          </span>
                        )}
                      </p>
                    )}
                    {due > 0 && (
                      <Badge variant="hot" className="mt-1">
                        {COMMISSION_COLLECTION_STAGE_LABELS[stage]}
                      </Badge>
                    )}
                    {stage === "paid" && (b.commissionAmount ?? 0) > 0 && (
                      <Badge variant="success" className="mt-1">
                        Commission received
                      </Badge>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </Card>
    </div>
  );
}
