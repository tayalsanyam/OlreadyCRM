"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type {
  ActivationDayEndPayload,
  CareCallyzerMuaContactRow,
  CareChatSupportRow,
  CareDayEndPayload,
  CareTicketRow,
  CommissionDayEndPayload,
  DayEndTemplateKey,
  FeedbackDayEndDetailRow,
  FeedbackDayEndPayload,
  FeedbackDayEndRatingRow,
  LeadBrideRow,
  LeadUploaderDayEndPayload,
  LeadUploaderLeadRow,
  MuaRow,
  RmActivityBookingRow,
  RmActivityPushRow,
  RmDayEndPayload,
  RmStalePlanMuaRow,
  SalesDayEndPayload,
  SalesOpsDayEndPayload,
  TargetVsAchieved,
} from "@/lib/day-end";
import { formatTalkTime, leadUploaderReferralWorkedLabel, type UploaderCallyzerTouch } from "@/lib/day-end";
import { ticketStatusLabel } from "@/lib/ticket-status";
import { formatDate } from "@/lib/utils";
import { PLAN_TIER_LABELS, type PlanTier } from "@/lib/types";
import { EntitySearchInput } from "@/components/day-end/day-end-shared";

function TargetBlock({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TargetVsAchieved;
  onChange: (v: TargetVsAchieved) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="mb-2 text-sm font-medium text-text">{label}</p>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <label className="space-y-1">
          <span className="text-xs text-slate-muted">Target</span>
          <input
            type="number"
            className="w-full rounded border border-slate-200 px-2 py-1"
            value={value.target}
            onChange={(e) =>
              onChange({
                ...value,
                target: Number(e.target.value),
                gap: Number(e.target.value) - value.achieved,
              })
            }
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-muted">Achieved</span>
          <input
            type="number"
            className="w-full rounded border border-slate-200 px-2 py-1"
            value={value.achieved}
            onChange={(e) =>
              onChange({
                ...value,
                achieved: Number(e.target.value),
                gap: value.target - Number(e.target.value),
              })
            }
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-muted">Gap</span>
          <input
            type="number"
            readOnly
            className="w-full rounded border border-slate-100 bg-light-bg px-2 py-1"
            value={value.gap}
          />
        </label>
      </div>
    </div>
  );
}

function MuaRowsEditor({
  title,
  rows,
  onChange,
  allowDetail,
}: {
  title: string;
  rows: MuaRow[];
  onChange: (rows: MuaRow[]) => void;
  allowDetail?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium text-text">{title}</h3>
        <EntitySearchInput
          mode="mua"
          onSelect={(item) =>
            onChange([
              ...rows,
              {
                muaId: item.id,
                muaName: item.label,
                stage: "",
                lastContact: null,
                manual: true,
              },
            ])
          }
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-muted">None — add MUAs manually or save to refresh auto-pick.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={`${row.muaId}-${idx}`} className="rounded border border-slate-100 p-3 text-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{row.muaName}</p>
                  <p className="text-xs text-slate-muted">
                    Stage: {row.stage || "—"} · Last contact:{" "}
                    {row.lastContact ? formatDate(row.lastContact) : "—"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                >
                  Remove
                </Button>
              </div>
              {allowDetail && (
                <textarea
                  className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Discussion detail…"
                  value={row.detail ?? ""}
                  onChange={(e) => {
                    const next = [...rows];
                    next[idx] = { ...row, detail: e.target.value };
                    onChange(next);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function planTierLabel(raw: string): string {
  const map: Record<string, PlanTier> = {
    highest_privy: "highestPrivy",
    phoenix: "phoenix",
    phoenix_2: "phoenix2",
  };
  const key = map[raw] ?? (raw as PlanTier);
  return PLAN_TIER_LABELS[key] ?? raw;
}

function RmAutoPushList({
  rows,
  onChange,
}: {
  rows: RmActivityPushRow[];
  onChange: (rows: RmActivityPushRow[]) => void;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="font-medium text-text">
          All pushes today ({rows.length})
        </h3>
        <p className="mt-0.5 text-xs text-slate-muted">
          Auto-filled from pushes you created today. Add remarks if needed.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-muted">No pushes today.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={row.pushId} className="rounded border border-slate-100 p-3 text-sm">
              <p className="font-medium">{row.brideName}</p>
              <p className="text-xs text-slate-muted">
                {row.muaName}
                {row.ceremonyType ? ` · ${row.ceremonyType}` : ""}
              </p>
              <textarea
                className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                placeholder="Remarks…"
                value={row.comments ?? ""}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...row, comments: e.target.value };
                  onChange(next);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RmAutoBookingList({
  rows,
  onChange,
}: {
  rows: RmActivityBookingRow[];
  onChange: (rows: RmActivityBookingRow[]) => void;
}) {
  const inr = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="font-medium text-text">
          All bookings today ({rows.length})
        </h3>
        <p className="mt-0.5 text-xs text-slate-muted">
          Auto-filled from bookings confirmed today on your leads.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-muted">No bookings today.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={row.bookingId} className="rounded border border-slate-100 p-3 text-sm">
              <p className="font-medium">{row.brideName}</p>
              <p className="text-xs text-slate-muted">
                {row.muaName}
                {row.ceremonyType ? ` · ${row.ceremonyType}` : ""}
                {row.bookedPrice != null
                  ? ` · ${inr.format(row.bookedPrice)}`
                  : ""}
              </p>
              <textarea
                className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                placeholder="Remarks…"
                value={row.comments ?? ""}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...row, comments: e.target.value };
                  onChange(next);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RmMuasWorkedTodayList({
  rows,
  onChange,
}: {
  rows: MuaRow[];
  onChange: (rows: MuaRow[]) => void;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="font-medium text-text">
          MUAs worked on today ({rows.length})
        </h3>
        <p className="mt-0.5 text-xs text-slate-muted">
          Auto-filled from today&apos;s pushes, bookings, and MUA calls.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-muted">No MUA activity recorded today.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={`${row.muaId}-${idx}`} className="rounded border border-slate-100 p-3 text-sm">
              <p className="font-medium">{row.muaName}</p>
              <p className="text-xs text-slate-muted">
                {row.stage ? `Activity: ${row.stage}` : "Activity today"}
                {row.lastContact
                  ? ` · Last touch ${formatDate(row.lastContact)}`
                  : ""}
              </p>
              <textarea
                className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                placeholder="Remarks…"
                value={row.detail ?? ""}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...row, detail: e.target.value };
                  onChange(next);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RmStalePlanMuaList({
  rows,
  onChange,
}: {
  rows: RmStalePlanMuaRow[];
  onChange: (rows: RmStalePlanMuaRow[]) => void;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="font-medium text-text">
          My MUAs (Privy, Phoenix, Phoenix 2) not pushed for 7+ days ({rows.length})
        </h3>
        <p className="mt-0.5 text-xs text-slate-muted">
          Plan MUAs assigned to you with no push from you in the last 7 days.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-muted">All plan MUAs pushed within 7 days.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={row.muaId} className="rounded border border-amber-100 bg-amber-50/40 p-3 text-sm">
              <p className="font-medium">{row.muaName}</p>
              <p className="text-xs text-slate-muted">
                {planTierLabel(row.planTier)}
                {" · "}
                {row.lastPushedAt
                  ? `Last push ${formatDate(row.lastPushedAt)} (${row.daysSincePush ?? "—"}d)`
                  : "Never pushed by you"}
              </p>
              <textarea
                className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                placeholder="Plan for next push…"
                value={row.comments ?? ""}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...row, comments: e.target.value };
                  onChange(next);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RmLeadRowsEditor({
  title,
  subtitle,
  rows,
  onChange,
  showLastContact,
  muaPickMode = false,
  leadScope = "queue",
}: {
  title: string;
  subtitle?: string;
  rows: LeadBrideRow[];
  onChange: (rows: LeadBrideRow[]) => void;
  showLastContact?: boolean;
  /** Conference: suggested MUAs — user selects who was actually on the call. */
  muaPickMode?: boolean;
  leadScope?: "queue" | "all";
}) {
  const addLead = (item: { id: string; label: string }) => {
    if (rows.some((r) => r.leadId === item.id)) return;
    onChange([
      ...rows,
      {
        leadId: item.id,
        brideName: item.label.split(" (")[0] ?? item.label,
        comments: "",
        muas: [],
        manual: true,
      },
    ]);
  };

  const addMua = (idx: number, item: { id: string; label: string }) => {
    const row = rows[idx];
    if (!row) return;
    const muas = row.muas ?? [];
    if (muas.some((m) => m.muaId === item.id)) return;
    const next = [...rows];
    next[idx] = {
      ...row,
      muas: [
        ...muas,
        {
          muaId: item.id,
          muaName: item.label.split(" (")[0] ?? item.label,
          suggested: false,
          selected: true,
        },
      ],
    };
    onChange(next);
  };

  const toggleMua = (rowIdx: number, muaId: string) => {
    const row = rows[rowIdx];
    if (!row) return;
    const next = [...rows];
    next[rowIdx] = {
      ...row,
      muas: (row.muas ?? []).map((m) =>
        m.muaId === muaId ? { ...m, selected: !m.selected } : m,
      ),
    };
    onChange(next);
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-medium text-text">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-muted">{subtitle}</p>}
        </div>
        <div className="w-full sm:w-72">
          <EntitySearchInput
            mode="lead"
            leadScope={leadScope}
            placeholder="Add from your queue…"
            onSelect={addLead}
          />
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-muted">
          Auto-picked on refresh, or add leads from your queue above.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={`${row.leadId}-${idx}`} className="rounded border border-slate-100 p-3 text-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{row.brideName}</p>
                  {showLastContact && (
                    <p className="text-xs text-slate-muted">
                      Last contact today: {row.lastContact ? formatDate(row.lastContact) : "—"}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                >
                  Remove
                </Button>
              </div>
              {muaPickMode && (
                <div className="mb-2">
                  <p className="mb-1.5 text-xs text-slate-muted">
                    Who was on the conference? Tap to select — you don&apos;t need to pick every MUA on the lead.
                  </p>
                  {(row.muas?.length ?? 0) > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {row.muas!.map((m) => {
                        const selected = m.selected === true;
                        return (
                          <button
                            key={m.muaId}
                            type="button"
                            onClick={() => toggleMua(idx, m.muaId)}
                            className={
                              selected
                                ? "rounded-full bg-brand px-2.5 py-1 text-xs font-medium text-white"
                                : "rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-muted hover:border-brand hover:text-brand"
                            }
                          >
                            {m.muaName}
                            {!selected && m.suggested !== false ? " · suggested" : ""}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-muted">No MUAs suggested — search below to add.</p>
                  )}
                  <div className="mt-2 w-full sm:max-w-xs">
                    <EntitySearchInput
                      mode="mua"
                      placeholder="Add another MUA…"
                      onSelect={(item) => addMua(idx, item)}
                    />
                  </div>
                </div>
              )}
              <textarea
                className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                placeholder="Remarks…"
                value={row.comments}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...row, comments: e.target.value };
                  onChange(next);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function StatInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-slate-muted">{label}</span>
      <input
        type="number"
        className="w-full rounded border border-slate-200 px-2 py-1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function SalesDayEndForm({
  payload,
  onChange,
}: {
  payload: SalesDayEndPayload;
  onChange: (p: SalesDayEndPayload) => void;
}) {
  return (
    <div className="space-y-4">
      <TargetBlock
        label="Targets vs Achieved & GAP (Revenue MTD)"
        value={payload.targetsVsAchieved}
        onChange={(targetsVsAchieved) => onChange({ ...payload, targetsVsAchieved })}
      />
      {payload.soldTargetsVsAchieved ? (
        <TargetBlock
          label="Targets vs Achieved & GAP (Deals closed MTD)"
          value={payload.soldTargetsVsAchieved}
          onChange={(soldTargetsVsAchieved) => onChange({ ...payload, soldTargetsVsAchieved })}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-muted">Last deal closed — date</span>
          <input
            type="date"
            className="w-full rounded border border-slate-200 px-2 py-1"
            value={payload.lastDealClosedDate?.slice(0, 10) ?? ""}
            onChange={(e) =>
              onChange({ ...payload, lastDealClosedDate: e.target.value || null })
            }
          />
        </label>
        <StatInput
          label="Today's revenue"
          value={payload.todaysRevenue}
          onChange={(todaysRevenue) => onChange({ ...payload, todaysRevenue })}
        />
      </div>
      <MuaRowsEditor
        title="Confirmed MUAs"
        rows={payload.confirmedMuas}
        onChange={(confirmedMuas) => onChange({ ...payload, confirmedMuas })}
      />
      <MuaRowsEditor
        title="Demo scheduled today"
        rows={payload.demosScheduledToday}
        onChange={(demosScheduledToday) => onChange({ ...payload, demosScheduledToday })}
      />
      <MuaRowsEditor
        title="Details shared today"
        rows={payload.detailsSharedToday ?? []}
        onChange={(detailsSharedToday) => onChange({ ...payload, detailsSharedToday })}
      />
      <MuaRowsEditor
        title="Deals closed today"
        rows={payload.dealsClosedToday ?? []}
        onChange={(dealsClosedToday) => onChange({ ...payload, dealsClosedToday })}
        allowDetail
      />
      <MuaRowsEditor
        title="Issues — discussion"
        rows={payload.issuesDiscussion}
        onChange={(issuesDiscussion) => onChange({ ...payload, issuesDiscussion })}
        allowDetail
      />
      <Card className="p-4">
        <h3 className="mb-3 font-medium text-text">Auto summary</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatInput
            label="Calls made"
            value={payload.autoSummary.callsMade}
            onChange={(callsMade) =>
              onChange({
                ...payload,
                autoSummary: { ...payload.autoSummary, callsMade },
              })
            }
          />
          <StatInput
            label="Demos / follow-ups"
            value={payload.autoSummary.demosFollowUps}
            onChange={(demosFollowUps) =>
              onChange({
                ...payload,
                autoSummary: { ...payload.autoSummary, demosFollowUps },
              })
            }
          />
          <StatInput
            label="Pipeline moves"
            value={payload.autoSummary.pipelineMoves}
            onChange={(pipelineMoves) =>
              onChange({
                ...payload,
                autoSummary: { ...payload.autoSummary, pipelineMoves },
              })
            }
          />
        </div>
      </Card>
    </div>
  );
}

export function SalesOpsDayEndForm({
  payload,
  onChange,
}: {
  payload: SalesOpsDayEndPayload;
  onChange: (p: SalesOpsDayEndPayload) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StatInput
        label="Calls made"
        value={payload.callsMade}
        onChange={(callsMade) => onChange({ ...payload, callsMade })}
      />
      <StatInput
        label="Tasks closed"
        value={payload.tasksClosed}
        onChange={(tasksClosed) => onChange({ ...payload, tasksClosed })}
      />
      <StatInput
        label="Queue actions"
        value={payload.queueActions}
        onChange={(queueActions) => onChange({ ...payload, queueActions })}
      />
      <label className="col-span-full space-y-1 text-sm">
        <span className="text-slate-muted">Notes (manual addition)</span>
        <textarea
          className="min-h-[100px] w-full rounded border border-slate-200 px-2 py-1"
          value={payload.notes}
          onChange={(e) => onChange({ ...payload, notes: e.target.value })}
        />
      </label>
    </div>
  );
}

function RmDayEndFormBody({
  payload,
  onChange,
  commissionExtras,
  regionalMode = false,
  activityMode = false,
}: {
  payload: RmDayEndPayload | CommissionDayEndPayload;
  onChange: (p: RmDayEndPayload | CommissionDayEndPayload) => void;
  commissionExtras?: boolean;
  regionalMode?: boolean;
  /** Pushes / bookings / MUAs worked today (regional + commission). */
  activityMode?: boolean;
}) {
  const p = payload as CommissionDayEndPayload;
  const allPushesToday = payload.allPushesToday ?? [];
  const allBookingsToday = payload.allBookingsToday ?? [];
  const muasWorkedToday = payload.muasWorkedToday ?? [];
  const stalePlanMuasNotPushed = payload.stalePlanMuasNotPushed ?? [];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <TargetBlock
          label="Booking target vs achieved"
          value={payload.bookingTargetVsAchieved}
          onChange={(bookingTargetVsAchieved) =>
            onChange({ ...payload, bookingTargetVsAchieved })
          }
        />
        <TargetBlock
          label="Push target vs achieved"
          value={payload.pushTargetVsAchieved}
          onChange={(pushTargetVsAchieved) => onChange({ ...payload, pushTargetVsAchieved })}
        />
      </div>
      {commissionExtras && (
        <>
          <TargetBlock
            label="Commission target vs achieved"
            value={p.commissionTargetVsAchieved}
            onChange={(commissionTargetVsAchieved) =>
              onChange({ ...payload, commissionTargetVsAchieved } as CommissionDayEndPayload)
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatInput
              label="Commission earned today"
              value={p.commissionEarnedToday}
              onChange={(commissionEarnedToday) =>
                onChange({ ...payload, commissionEarnedToday } as CommissionDayEndPayload)
              }
            />
            <StatInput
              label="Payments received today"
              value={p.paymentsReceivedToday}
              onChange={(paymentsReceivedToday) =>
                onChange({ ...payload, paymentsReceivedToday } as CommissionDayEndPayload)
              }
            />
            <StatInput
              label="Pending payments MTD"
              value={p.pendingPaymentsMtd}
              onChange={(pendingPaymentsMtd) =>
                onChange({ ...payload, pendingPaymentsMtd } as CommissionDayEndPayload)
              }
            />
            <StatInput
              label="Overall pending payments"
              value={p.overallPendingPayments}
              onChange={(overallPendingPayments) =>
                onChange({ ...payload, overallPendingPayments } as CommissionDayEndPayload)
              }
            />
          </div>
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatInput
          label="Privy bookings MTD"
          value={payload.privyBookingsMtd}
          onChange={(privyBookingsMtd) => onChange({ ...payload, privyBookingsMtd })}
        />
        <StatInput
          label="Privy bookings today"
          value={payload.privyBookingsToday}
          onChange={(privyBookingsToday) => onChange({ ...payload, privyBookingsToday })}
        />
        {!regionalMode && (
          <>
            <StatInput
              label="Push today"
              value={payload.pushToday}
              onChange={(pushToday) => onChange({ ...payload, pushToday })}
            />
            <StatInput
              label="Bookings today"
              value={payload.bookingsToday}
              onChange={(bookingsToday) => onChange({ ...payload, bookingsToday })}
            />
          </>
        )}
        <StatInput
          label="Calls made today"
          value={payload.callsToday}
          onChange={(callsToday) => onChange({ ...payload, callsToday })}
        />
        <label className="space-y-1 text-sm">
          <span className="text-slate-muted">Total talk time</span>
          <div className="rounded border border-slate-100 bg-light-bg px-2 py-1.5 font-medium text-text">
            {formatTalkTime(payload.talkTimeSec ?? 0)}
          </div>
          <span className="text-xs text-slate-muted">From Callyzer call duration</span>
        </label>
      </div>
      {(regionalMode || activityMode) && (
        <>
          <RmAutoPushList
            rows={allPushesToday}
            onChange={(allPushesToday) =>
              onChange({
                ...payload,
                allPushesToday,
                pushToday: allPushesToday.length,
              })
            }
          />
          <RmAutoBookingList
            rows={allBookingsToday}
            onChange={(allBookingsToday) =>
              onChange({
                ...payload,
                allBookingsToday,
                bookingsToday: allBookingsToday.length,
              })
            }
          />
          <RmMuasWorkedTodayList
            rows={muasWorkedToday}
            onChange={(muasWorkedToday) => onChange({ ...payload, muasWorkedToday })}
          />
          {regionalMode && (
            <RmStalePlanMuaList
              rows={stalePlanMuasNotPushed}
              onChange={(stalePlanMuasNotPushed) =>
                onChange({ ...payload, stalePlanMuasNotPushed })
              }
            />
          )}
        </>
      )}
      {!regionalMode && (
        <RmLeadRowsEditor
          title="Pipeline tomorrow (booking / closure)"
          subtitle="Leads with an open event tomorrow — add from your queue and note remarks."
          rows={payload.pipelinesTomorrow}
          onChange={(pipelinesTomorrow) => onChange({ ...payload, pipelinesTomorrow })}
          showLastContact
        />
      )}
      <RmLeadRowsEditor
        title="Conference"
        subtitle="Leads you contacted today — select which MUAs were on each conference and add remarks."
        rows={payload.conferenceCalls}
        onChange={(conferenceCalls) => onChange({ ...payload, conferenceCalls })}
        showLastContact
        muaPickMode
      />
    </div>
  );
}

export function CareDayEndForm({
  payload,
  onChange,
}: {
  payload: CareDayEndPayload;
  onChange: (p: CareDayEndPayload) => void;
}) {
  const careTicketSection = (
    title: string,
    subtitle: string | undefined,
    key: keyof Pick<
      CareDayEndPayload,
      "issuesListToday" | "issuesAddressedToday" | "urgentIssues" | "ticketsClosedToday" | "discussionPoints"
    >,
    opts?: { showDays?: boolean; showLastContact?: boolean },
  ) => (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="font-medium text-text">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-muted">{subtitle}</p>}
      </div>
      {payload[key].length === 0 ? (
        <p className="text-sm text-slate-muted">None auto-picked.</p>
      ) : (
        <ul className="space-y-3">
          {payload[key].map((t, idx) => (
            <li key={`${t.ticketId}-${idx}`} className="rounded border border-slate-100 p-3 text-sm">
              <p className="font-medium text-text">
                {t.ticketNumber} — {t.partyName ?? "Unknown"}
                {t.partyPhone ? ` · ${t.partyPhone}` : ""}
              </p>
              <p className="mt-1 text-xs text-slate-muted">
                {t.partyType === "bride" ? "Bride" : t.partyType === "mua" ? "MUA" : "Contact"}
                {t.issueSummary ? ` · ${t.issueSummary}` : t.subject ? ` · ${t.subject}` : ""}
              </p>
              <p className="mt-1 text-xs">
                Status: {t.status ? ticketStatusLabel(t.status) : "—"}
                {opts?.showDays && t.daysSinceOpen != null ? ` · ${t.daysSinceOpen}d open` : ""}
                {t.escalationLevel != null && t.escalationLevel >= 2
                  ? ` · L${t.escalationLevel}`
                  : ""}
              </p>
              {t.todayAction && (
                <p className="mt-1 text-xs text-slate-muted">
                  {opts?.showLastContact ? "Last contact / action" : "Today's action"}: {t.todayAction}
                </p>
              )}
              {opts?.showLastContact && t.lastContact && (
                <p className="mt-0.5 text-xs text-slate-muted">
                  Last: {formatDate(t.lastContact)}
                </p>
              )}
              {"remarks" in t && (
                <textarea
                  className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Remarks…"
                  value={t.remarks ?? ""}
                  onChange={(e) => {
                    const next = [...payload[key]];
                    next[idx] = { ...t, remarks: e.target.value };
                    onChange({ ...payload, [key]: next });
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span className="text-slate-muted">Total open tickets</span>
          <div className="rounded border border-slate-100 bg-light-bg px-2 py-1.5 text-lg font-semibold text-text">
            {payload.totalOpenTickets ?? 0}
          </div>
        </label>
        <StatInput
          label="Calls"
          value={payload.callsMade}
          onChange={(callsMade) => onChange({ ...payload, callsMade })}
        />
        <label className="space-y-1 text-sm">
          <span className="text-slate-muted">Talk time</span>
          <div className="rounded border border-slate-100 bg-light-bg px-2 py-1.5 font-medium text-text">
            {formatTalkTime(payload.talkTimeSec ?? 0)}
          </div>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-muted">Open L2 / L3 issues</span>
          <div className="rounded border border-slate-100 bg-light-bg px-2 py-1.5 text-lg font-semibold text-text">
            {payload.openL2L3Count ?? 0}
          </div>
        </label>
      </div>

      <Card className="p-4">
        <h3 className="mb-1 font-medium text-text">Auto contact (Callyzer) — MUA with tickets</h3>
        <p className="mb-3 text-xs text-slate-muted">
          Callyzer calls to MUAs today that match an open (unresolved) ticket on that MUA.
        </p>
        {(payload.callyzerMuaContacts ?? []).length === 0 ? (
          <p className="text-sm text-slate-muted">No MUA Callyzer calls with an open ticket today.</p>
        ) : (
          <ul className="space-y-3">
            {(payload.callyzerMuaContacts ?? []).map((row, idx) => (
              <li key={row.callLogId} className="rounded border border-slate-100 p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <CallyzerBadge callyzer={row.callyzer} />
                  <span className="font-medium text-text">
                    {row.muaName}
                    {row.muaPhone ? ` · ${row.muaPhone}` : ""}
                  </span>
                  <span className="text-xs text-slate-muted">{row.ticketNumber}</span>
                </div>
                <p className="text-xs text-slate-muted">{row.issueSummary}</p>
                <textarea
                  className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Remarks…"
                  value={row.remarks ?? ""}
                  onChange={(e) => {
                    const next = [...(payload.callyzerMuaContacts ?? [])];
                    next[idx] = { ...row, remarks: e.target.value };
                    onChange({ ...payload, callyzerMuaContacts: next });
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {careTicketSection(
        "Tickets closed today",
        "Tickets moved to closed / approved today.",
        "ticketsClosedToday",
      )}
      {careTicketSection(
        "Issues — list today",
        "New open tickets logged today.",
        "issuesListToday",
      )}
      {careTicketSection(
        "Issues addressed today",
        "Tickets you worked on today — status and today's action.",
        "issuesAddressedToday",
      )}
      {careTicketSection(
        "Issues requiring urgent attention (L2, L3)",
        "Escalated open tickets — status, last contact, days since opened.",
        "urgentIssues",
        { showDays: true, showLastContact: true },
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatInput
          label="Tasks done today"
          value={payload.tasksDoneToday}
          onChange={(tasksDoneToday) => onChange({ ...payload, tasksDoneToday })}
        />
        <StatInput
          label="Pending tasks"
          value={payload.pendingTasks}
          onChange={(pendingTasks) => onChange({ ...payload, pendingTasks })}
        />
      </div>

      {careTicketSection(
        "Discussions with admin",
        "Auto-filled from internal ticket notes and admin loop-ins / interventions today.",
        "discussionPoints",
      )}

      <Card className="p-4">
        <h3 className="mb-1 font-medium text-text">Chat support — activity today</h3>
        <p className="mb-3 text-xs text-slate-muted">
          Support inquiries from chat / interest forms assigned to or completed by you today.
        </p>
        {(payload.chatSupportActivity ?? []).length === 0 ? (
          <p className="text-sm text-slate-muted">No chat support activity today.</p>
        ) : (
          <ul className="space-y-3">
            {(payload.chatSupportActivity ?? []).map((row, idx) => (
              <li key={row.inquiryId} className="rounded border border-slate-100 p-3 text-sm">
                <p className="font-medium text-text">
                  {row.displayId} — {row.visitorName}
                  {row.phone ? ` · ${row.phone}` : ""}
                </p>
                <p className="mt-1 text-xs capitalize text-slate-muted">{row.visitorKind}</p>
                <p className="mt-1 text-xs">{row.detail}</p>
                <textarea
                  className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Remarks…"
                  value={row.remarks ?? ""}
                  onChange={(e) => {
                    const next = [...(payload.chatSupportActivity ?? [])];
                    next[idx] = { ...row, remarks: e.target.value };
                    onChange({ ...payload, chatSupportActivity: next });
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-medium text-text">Manual add tickets</h3>
          <div className="w-64">
            <EntitySearchInput
              mode="ticket"
              onSelect={(item) =>
                onChange({
                  ...payload,
                  manualTickets: [
                    ...payload.manualTickets,
                    {
                      ticketId: item.id,
                      ticketNumber: item.label.split(" — ")[0] ?? item.label,
                      subject: item.label,
                      manual: true,
                    },
                  ],
                })
              }
            />
          </div>
        </div>
        {payload.manualTickets.length === 0 ? (
          <p className="text-sm text-slate-muted">Search and add tickets manually.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {payload.manualTickets.map((t, idx) => (
              <li key={`${t.ticketId}-${idx}`} className="rounded border border-slate-100 p-2">
                <p className="font-medium">
                  {t.ticketNumber} — {t.subject}
                </p>
                <textarea
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Discussion detail…"
                  value={t.detail ?? ""}
                  onChange={(e) => {
                    const next = [...payload.manualTickets];
                    next[idx] = { ...t, detail: e.target.value };
                    onChange({ ...payload, manualTickets: next });
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function CallyzerBadge({ callyzer }: { callyzer: UploaderCallyzerTouch | null }) {
  if (!callyzer) return null;
  return (
    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
      Callyzer {formatTalkTime(callyzer.durationSec)}
      {callyzer.direction ? ` · ${callyzer.direction}` : ""}
      {callyzer.calledAt ? ` · ${formatDate(callyzer.calledAt)}` : ""}
    </span>
  );
}

function UploaderLeadSection({
  title,
  subtitle,
  rows,
  onChange,
}: {
  title: string;
  subtitle?: string;
  rows: LeadUploaderLeadRow[];
  onChange: (rows: LeadUploaderLeadRow[]) => void;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="font-medium text-text">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-muted">{subtitle}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-muted">None auto-picked for today.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, idx) => (
            <li
              key={`${row.leadId}-${idx}`}
              className={`rounded border p-3 text-sm ${
                row.workedWithoutCallyzer
                  ? "border-red-300 bg-red-50/50"
                  : "border-slate-100"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {row.callyzer ? (
                  <CallyzerBadge callyzer={row.callyzer} />
                ) : (
                  <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    No Callyzer log
                  </span>
                )}
                <span className="font-medium text-text">
                  {row.brideName}
                  {row.displayId ? ` (${row.displayId})` : ""}
                </span>
              </div>
              <p className="text-xs text-slate-muted">{row.detail}</p>
              <textarea
                className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                placeholder="Remarks…"
                value={row.remarks ?? ""}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...row, remarks: e.target.value };
                  onChange(next);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function LeadUploaderDayEndForm({
  payload,
  onChange,
}: {
  payload: LeadUploaderDayEndPayload;
  onChange: (p: LeadUploaderDayEndPayload) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span className="text-slate-muted">Leads uploaded</span>
          <div className="rounded border border-slate-100 bg-light-bg px-2 py-1.5 text-lg font-semibold text-text">
            {payload.leadsUploaded}
          </div>
        </label>
        <StatInput
          label="Calls made"
          value={payload.callsMade}
          onChange={(callsMade) => onChange({ ...payload, callsMade })}
        />
        <label className="space-y-1 text-sm">
          <span className="text-slate-muted">Total talk time</span>
          <div className="rounded border border-slate-100 bg-light-bg px-2 py-1.5 font-medium text-text">
            {formatTalkTime(payload.talkTimeSec ?? 0)}
          </div>
        </label>
        <StatInput
          label="Tasks completed"
          value={payload.tasksCompleted}
          onChange={(tasksCompleted) => onChange({ ...payload, tasksCompleted })}
        />
      </div>

      <UploaderLeadSection
        title="Leads verified today"
        subtitle="Callyzer call shown when logged; rows in red had no Callyzer match for today."
        rows={payload.leadsVerifiedToday}
        onChange={(leadsVerifiedToday) => onChange({ ...payload, leadsVerifiedToday })}
      />
      <UploaderLeadSection
        title="Leads re-verified"
        rows={payload.leadsReVerifiedToday}
        onChange={(leadsReVerifiedToday) => onChange({ ...payload, leadsReVerifiedToday })}
      />
      <UploaderLeadSection
        title="Not answering"
        rows={payload.notAnsweringToday}
        onChange={(notAnsweringToday) => onChange({ ...payload, notAnsweringToday })}
      />
      <UploaderLeadSection
        title="Closed — not interested"
        rows={payload.closedNotInterestedToday}
        onChange={(closedNotInterestedToday) => onChange({ ...payload, closedNotInterestedToday })}
      />

      <Card className="p-4">
        <h3 className="mb-3 font-medium text-text">Feedback referrals worked today</h3>
        {payload.feedbackReferralsAdded.length === 0 ? (
          <p className="text-sm text-slate-muted">None worked today.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {payload.feedbackReferralsAdded.map((r) => (
              <li key={r.id} className="rounded border border-slate-100 p-2">
                <p className="font-medium">
                  {r.referralName}
                  {r.referralPhone ? ` · ${r.referralPhone}` : ""}
                  <span className="ml-2 text-xs font-normal text-slate-muted">
                    — {leadUploaderReferralWorkedLabel(r.status)}
                  </span>
                </p>
                <p className="text-xs text-slate-muted">From lead: {r.sourceBrideName}</p>
                {r.notes && <p className="mt-1 text-xs">{r.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function ActivationDayEndForm({
  payload,
  onChange,
}: {
  payload: ActivationDayEndPayload;
  onChange: (p: ActivationDayEndPayload) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatInput
          label="Calls made"
          value={payload.callsMade}
          onChange={(callsMade) => onChange({ ...payload, callsMade })}
        />
        <label className="space-y-1 text-sm">
          <span className="text-slate-muted">Total talk time</span>
          <div className="rounded border border-slate-100 bg-light-bg px-2 py-1.5 font-medium text-text">
            {formatTalkTime(payload.talkTimeSec ?? 0)}
          </div>
        </label>
      </div>

      <Card className="p-4">
        <h3 className="mb-1 font-medium text-text">Plans activated today</h3>
        <p className="mb-3 text-xs text-slate-muted">MUAs you activated today with onboarding plan snapshot.</p>
        {payload.plansActivatedToday.length === 0 ? (
          <p className="text-sm text-slate-muted">None activated today.</p>
        ) : (
          <ul className="space-y-3">
            {payload.plansActivatedToday.map((row, idx) => (
              <li key={row.pipelineId} className="rounded border border-slate-100 p-3 text-sm">
                <p className="font-medium text-text">
                  {row.muaName} · {row.muaCity}
                </p>
                <div className="mt-1 grid gap-1 text-xs text-slate-muted sm:grid-cols-2">
                  <span>Plan: {row.plan}</span>
                  <span>Lead cap: {row.leadCap ?? "—"}</span>
                  <span>Budget: {row.leadBudget ?? "—"}</span>
                  <span>Quoted: {row.quotedAmount != null ? `₹${row.quotedAmount.toLocaleString("en-IN")}` : "—"}</span>
                  <span>Ends: {row.durationEnd ? formatDate(row.durationEnd) : "—"}</span>
                  <span>Invoice: {row.invoiceNumber ?? "—"}</span>
                  {row.regions.length > 0 && <span>Regions: {row.regions.join(", ")}</span>}
                  {row.cities.length > 0 && <span>Cities: {row.cities.join(", ")}</span>}
                </div>
                <textarea
                  className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Remarks…"
                  value={row.remarks ?? ""}
                  onChange={(e) => {
                    const next = [...payload.plansActivatedToday];
                    next[idx] = { ...row, remarks: e.target.value };
                    onChange({ ...payload, plansActivatedToday: next });
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-1 font-medium text-text">Activation queue</h3>
        <p className="mb-3 text-xs text-slate-muted">
          Training-complete MUAs waiting for activation — days in stage and pending invoice / contract steps.
        </p>
        {payload.activationQueue.length === 0 ? (
          <p className="text-sm text-slate-muted">Queue is empty.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-muted">
                  <th className="py-2 pr-3 font-medium">MUA</th>
                  <th className="py-2 pr-3 font-medium">Sales</th>
                  <th className="py-2 pr-3 font-medium">Days in stage</th>
                  <th className="py-2 pr-3 font-medium">Pending action</th>
                  <th className="py-2 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {payload.activationQueue.map((row, idx) => (
                  <tr key={row.pipelineId} className="border-b border-slate-50 align-top">
                    <td className="py-2 pr-3">
                      <p className="font-medium">{row.muaName}</p>
                      <p className="text-xs text-slate-muted">
                        {row.muaCity} · {row.muaType}
                      </p>
                    </td>
                    <td className="py-2 pr-3 text-xs">{row.assignedSalesName ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          row.daysInStage >= 14
                            ? "font-semibold text-red-600"
                            : row.daysInStage >= 7
                              ? "font-medium text-amber-700"
                              : ""
                        }
                      >
                        {row.daysInStage}d
                      </span>
                      <p className="text-xs text-slate-muted">{row.stageLabel}</p>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {row.pendingActions.map((action) => (
                          <span
                            key={action}
                            className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900"
                          >
                            {action}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2">
                      <textarea
                        className="w-full min-w-[140px] rounded border border-slate-200 px-2 py-1 text-xs"
                        placeholder="Remarks…"
                        rows={2}
                        value={row.remarks ?? ""}
                        onChange={(e) => {
                          const next = [...payload.activationQueue];
                          next[idx] = { ...row, remarks: e.target.value };
                          onChange({ ...payload, activationQueue: next });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function FeedbackDetailSection({
  title,
  subtitle,
  rows,
  onChange,
}: {
  title: string;
  subtitle?: string;
  rows: FeedbackDayEndDetailRow[];
  onChange: (rows: FeedbackDayEndDetailRow[]) => void;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="font-medium text-text">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-muted">{subtitle}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-muted">None from today&apos;s contact.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, idx) => (
            <li
              key={`${row.leadId}-${idx}`}
              className={`rounded border p-3 text-sm ${
                row.workedWithoutCallyzer
                  ? "border-red-300 bg-red-50/50"
                  : "border-slate-100"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {row.callyzer ? (
                  <CallyzerBadge callyzer={row.callyzer} />
                ) : (
                  <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    No Callyzer log
                  </span>
                )}
                <span className="font-medium text-text">
                  {row.brideName}
                  {row.displayId ? ` (${row.displayId})` : ""}
                </span>
              </div>
              <p className="text-xs text-slate-muted">{row.detail}</p>
              <textarea
                className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                placeholder="Remarks…"
                value={row.remarks ?? ""}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...row, remarks: e.target.value };
                  onChange(next);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FeedbackRatingSection({
  title,
  subtitle,
  rows,
  showMuaName,
  onChange,
}: {
  title: string;
  subtitle?: string;
  rows: FeedbackDayEndRatingRow[];
  showMuaName?: boolean;
  onChange: (rows: FeedbackDayEndRatingRow[]) => void;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="font-medium text-text">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-muted">{subtitle}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-muted">None from today&apos;s contact.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, idx) => (
            <li
              key={row.feedbackId}
              className={`rounded border p-3 text-sm ${
                row.workedWithoutCallyzer
                  ? "border-red-300 bg-red-50/50"
                  : "border-slate-100"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {row.callyzer ? (
                  <CallyzerBadge callyzer={row.callyzer} />
                ) : (
                  <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    No Callyzer log
                  </span>
                )}
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-text">
                  {row.rating}/5
                </span>
                <span className="font-medium text-text">
                  {row.brideName}
                  {row.displayId ? ` (${row.displayId})` : ""}
                </span>
                {showMuaName && row.muaName && (
                  <span className="text-xs text-slate-muted">MUA: {row.muaName}</span>
                )}
              </div>
              <p className="text-xs text-slate-muted">{row.detail}</p>
              <textarea
                className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                placeholder="Remarks…"
                value={row.remarks ?? ""}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...row, remarks: e.target.value };
                  onChange(next);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function FeedbackDayEndForm({
  payload,
  onChange,
}: {
  payload: FeedbackDayEndPayload;
  onChange: (p: FeedbackDayEndPayload) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatInput
          label="Total calls"
          value={payload.callsMade}
          onChange={(callsMade) => onChange({ ...payload, callsMade })}
        />
        <label className="space-y-1 text-sm">
          <span className="text-slate-muted">Total talk time</span>
          <div className="rounded border border-slate-100 bg-light-bg px-2 py-1.5 font-medium text-text">
            {formatTalkTime(payload.talkTimeSec ?? 0)}
          </div>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-muted">Post-event leads in queue</span>
          <div className="rounded border border-slate-100 bg-light-bg px-2 py-1.5 text-lg font-semibold text-text">
            {payload.postEventLeadsInQueue}
          </div>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-muted">Contacted today</span>
          <div className="rounded border border-slate-100 bg-light-bg px-2 py-1.5 text-lg font-semibold text-text">
            {payload.contactedToday}
          </div>
        </label>
      </div>

      <FeedbackDetailSection
        title="Follow-up from today's contact"
        subtitle="Green = Callyzer call logged today; red = worked with no Callyzer match."
        rows={payload.followUpFromToday}
        onChange={(followUpFromToday) => onChange({ ...payload, followUpFromToday })}
      />
      <FeedbackDetailSection
        title="Feedback given from today's contact"
        subtitle="Green = Callyzer call logged today; red = worked with no Callyzer match."
        rows={payload.feedbackGivenToday}
        onChange={(feedbackGivenToday) => onChange({ ...payload, feedbackGivenToday })}
      />
      <FeedbackDetailSection
        title="Refused from today's contact"
        subtitle="Green = Callyzer call logged today; red = worked with no Callyzer match."
        rows={payload.refusedToday}
        onChange={(refusedToday) => onChange({ ...payload, refusedToday })}
      />

      <Card className="p-4">
        <h3 className="mb-1 font-medium text-text">Referrals added today — leads</h3>
        <p className="mb-3 text-xs text-slate-muted">Structured lead referrals captured during feedback today.</p>
        {payload.referralsLeadToday.length === 0 ? (
          <p className="text-sm text-slate-muted">None added today.</p>
        ) : (
          <ul className="space-y-3">
            {payload.referralsLeadToday.map((row, idx) => (
              <li key={row.id} className="rounded border border-slate-100 p-3 text-sm">
                <p className="font-medium text-text">
                  {row.referralName}
                  {row.referralPhone ? ` · ${row.referralPhone}` : ""}
                </p>
                <p className="text-xs text-slate-muted">
                  From {row.brideName}
                  {row.displayId ? ` (${row.displayId})` : ""}
                </p>
                {row.detail && <p className="mt-1 text-xs">{row.detail}</p>}
                <textarea
                  className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Remarks…"
                  value={row.remarks ?? ""}
                  onChange={(e) => {
                    const next = [...payload.referralsLeadToday];
                    next[idx] = { ...row, remarks: e.target.value };
                    onChange({ ...payload, referralsLeadToday: next });
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-1 font-medium text-text">Referrals added today — MUA prospects</h3>
        <p className="mb-3 text-xs text-slate-muted">Non-Olready MUAs captured from feedback today.</p>
        {payload.referralsMuaToday.length === 0 ? (
          <p className="text-sm text-slate-muted">None added today.</p>
        ) : (
          <ul className="space-y-3">
            {payload.referralsMuaToday.map((row, idx) => (
              <li key={row.id} className="rounded border border-slate-100 p-3 text-sm">
                <p className="font-medium text-text">{row.muaName}</p>
                <p className="text-xs text-slate-muted">
                  From {row.brideName}
                  {row.phone ? ` · ${row.phone}` : ""}
                  {row.city ? ` · ${row.city}` : ""}
                </p>
                {row.detail && <p className="mt-1 text-xs">{row.detail}</p>}
                <textarea
                  className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Remarks…"
                  value={row.remarks ?? ""}
                  onChange={(e) => {
                    const next = [...payload.referralsMuaToday];
                    next[idx] = { ...row, remarks: e.target.value };
                    onChange({ ...payload, referralsMuaToday: next });
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <FeedbackRatingSection
        title="Negative Olready feedback (1–2)"
        subtitle="From today's contact — green = Callyzer log, red = no call record."
        rows={payload.negativeOlreadyToday}
        onChange={(negativeOlreadyToday) => onChange({ ...payload, negativeOlreadyToday })}
      />
      <FeedbackRatingSection
        title="Positive Olready feedback (4–5)"
        subtitle="From today's contact — green = Callyzer log, red = no call record."
        rows={payload.positiveOlreadyToday}
        onChange={(positiveOlreadyToday) => onChange({ ...payload, positiveOlreadyToday })}
      />
      <FeedbackRatingSection
        title="Negative MUA feedback (1–2)"
        subtitle="From today's contact — includes MUA name; green = Callyzer log, red = no call record."
        rows={payload.negativeMuaToday}
        showMuaName
        onChange={(negativeMuaToday) => onChange({ ...payload, negativeMuaToday })}
      />
      <FeedbackRatingSection
        title="Positive MUA feedback (4–5)"
        subtitle="From today's contact — includes MUA name; green = Callyzer log, red = no call record."
        rows={payload.positiveMuaToday}
        showMuaName
        onChange={(positiveMuaToday) => onChange({ ...payload, positiveMuaToday })}
      />
    </div>
  );
}

export function DayEndFormByTemplate({
  templateKey,
  payload,
  onChange,
  readOnly = false,
}: {
  templateKey: DayEndTemplateKey;
  payload: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const body = (() => {
    switch (templateKey) {
      case "sales":
        return (
          <SalesDayEndForm
            payload={payload as SalesDayEndPayload}
            onChange={(p) => onChange(p as Record<string, unknown>)}
          />
        );
      case "sales_ops":
        return (
          <SalesOpsDayEndForm
            payload={payload as SalesOpsDayEndPayload}
            onChange={(p) => onChange(p as Record<string, unknown>)}
          />
        );
      case "lead_uploader":
        return (
          <LeadUploaderDayEndForm
            payload={payload as LeadUploaderDayEndPayload}
            onChange={(p) => onChange(p as Record<string, unknown>)}
          />
        );
      case "activation":
        return (
          <ActivationDayEndForm
            payload={payload as ActivationDayEndPayload}
            onChange={(p) => onChange(p as Record<string, unknown>)}
          />
        );
      case "feedback":
        return (
          <FeedbackDayEndForm
            payload={payload as FeedbackDayEndPayload}
            onChange={(p) => onChange(p as Record<string, unknown>)}
          />
        );
      case "rm":
        return (
          <RmDayEndFormBody
            payload={payload as RmDayEndPayload}
            onChange={(p) => onChange(p as Record<string, unknown>)}
            regionalMode
          />
        );
      case "commission":
        return (
          <RmDayEndFormBody
            payload={payload as CommissionDayEndPayload}
            onChange={(p) => onChange(p as Record<string, unknown>)}
            commissionExtras
            activityMode
          />
        );
      case "care":
        return (
          <CareDayEndForm
            payload={payload as CareDayEndPayload}
            onChange={(p) => onChange(p as Record<string, unknown>)}
          />
        );
      default:
        return null;
    }
  })();

  if (!body) return null;
  if (readOnly) {
    return <fieldset disabled className="space-y-4 opacity-95 [&_*]:pointer-events-none">{body}</fieldset>;
  }
  return body;
}
