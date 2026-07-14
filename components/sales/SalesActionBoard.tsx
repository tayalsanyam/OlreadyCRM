"use client";

import Link from "next/link";
import { PipelineQuickContact } from "@/components/sales/PipelineQuickContact";
import { salesPipelineMuaTypeLabel } from "@/lib/sales-pipeline-labels";
import type { PipelineStage } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";

export type ActionPipelineRow = {
  id: string;
  muaName: string;
  muaCity?: string | null;
  muaPhone?: string | null;
  muaWhatsapp?: string | null;
  stage: string;
  muaType: string;
  priorityTag?: string | null;
  assignedToName?: string | null;
  daysInStage?: number;
  daysSinceLastContact?: number | null;
  priceOffered?: number | null;
  lastCallOutcome?: string | null;
  totalRepeatedNoAnswer?: number;
  reasons?: string[];
  lastNotePreview?: string | null;
};

export type ActionTaskRow = {
  id: string;
  title: string;
  taskType: string;
  dueDate: string;
  staffName?: string;
  daysOverdue?: number;
  overdue?: boolean;
};

const REASON_LABEL: Record<string, string> = {
  stale: "Stale 7d+",
  untouched: "Untouched 3d+",
  no_contact: "No contact 3d+",
  no_answer: "3× no answer",
};

function taskPipelineId(title: string): string | null {
  const m = title.match(/\[PIPE:([0-9a-f-]{36})\]/i);
  return m?.[1] ?? null;
}

function taskMuaName(title: string): string {
  const m = title.match(/^(.+?)\s*\[PIPE:/);
  return m?.[1]?.trim() || title.replace(/\s*\[PIPE:[^\]]+\].*$/, "").trim();
}

function ReasonChips({ reasons }: { reasons?: string[] }) {
  if (!reasons?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <span
          key={r}
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            r === "no_answer"
              ? "bg-red-100 text-red-800"
              : r === "stale"
                ? "bg-amber-100 text-amber-900"
                : "bg-orange-50 text-orange-800"
          }`}
        >
          {REASON_LABEL[r] ?? r}
        </span>
      ))}
    </div>
  );
}

export function SalesPipelineDetailTable({
  rows,
  showReasons,
  showPrice,
  showAssignee,
  showDaysInStage,
  showNote,
  onOpenPipeline,
}: {
  rows: ActionPipelineRow[];
  showReasons?: boolean;
  showPrice?: boolean;
  showAssignee?: boolean;
  showDaysInStage?: boolean;
  showNote?: boolean;
  onOpenPipeline: (id: string) => void;
}) {
  if (!rows.length) {
    return <p className="text-sm text-slate-muted">Nothing here — good progress.</p>;
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>MUA</TH>
          <TH>Stage</TH>
          <TH>Segment</TH>
          {showPrice ? <TH>Offer</TH> : null}
          {showDaysInStage ? <TH>Days in stage</TH> : null}
          <TH>Last contact</TH>
          {showNote ? <TH>Last note</TH> : null}
          {showReasons ? <TH>Why flagged</TH> : null}
          {showAssignee ? <TH>Assigned</TH> : null}
          <TH>Contact</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR
            key={r.id}
            className={
              (r.totalRepeatedNoAnswer ?? 0) >= 3 || (r.daysSinceLastContact ?? 0) >= 7
                ? "border-l-4 border-l-red-500"
                : r.stage === "Confirm"
                  ? "border-l-4 border-l-emerald-600"
                  : (r.daysSinceLastContact ?? 0) >= 3
                    ? "border-l-4 border-l-amber-500"
                    : ""
            }
          >
            <TD>
              <button
                type="button"
                className="text-left font-medium text-accent hover:underline"
                onClick={() => onOpenPipeline(r.id)}
              >
                {r.muaName}
              </button>
              {r.muaCity ? <p className="text-xs text-slate-muted">{r.muaCity}</p> : null}
            </TD>
            <TD>{r.stage}</TD>
            <TD>{salesPipelineMuaTypeLabel(r.muaType)}</TD>
            {showPrice ? (
              <TD>
                {r.priceOffered != null && Number(r.priceOffered) > 0
                  ? `₹${Number(r.priceOffered).toLocaleString("en-IN")}`
                  : "—"}
              </TD>
            ) : null}
            {showDaysInStage ? <TD>{r.daysInStage ?? "—"}d</TD> : null}
            <TD>
              {r.daysSinceLastContact != null ? `${r.daysSinceLastContact}d ago` : "—"}
              {r.lastCallOutcome ? (
                <p className="text-[10px] text-slate-muted">{r.lastCallOutcome.replace(/_/g, " ")}</p>
              ) : null}
            </TD>
            {showNote ? (
              <TD className="max-w-[180px] truncate text-xs text-slate-600">{r.lastNotePreview ?? "—"}</TD>
            ) : null}
            {showReasons ? (
              <TD>
                <ReasonChips reasons={r.reasons} />
              </TD>
            ) : null}
            {showAssignee ? <TD>{r.assignedToName ?? "—"}</TD> : null}
            <TD>
              <PipelineQuickContact
                pipelineId={r.id}
                muaName={r.muaName}
                muaPhone={r.muaPhone}
                muaWhatsapp={r.muaWhatsapp}
                muaCity={r.muaCity}
                stage={r.stage as PipelineStage}
                variant="compact"
              />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function TaskActionTable({
  rows,
  showStaff,
  onOpenPipeline,
}: {
  rows: ActionTaskRow[];
  showStaff?: boolean;
  onOpenPipeline: (id: string) => void;
}) {
  if (!rows.length) {
    return <p className="text-sm text-slate-muted">No tasks in this bucket.</p>;
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>MUA / task</TH>
          {showStaff ? <TH>Staff</TH> : null}
          <TH>Due</TH>
          <TH>Open</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => {
          const pipelineId = taskPipelineId(r.title);
          const muaName = taskMuaName(r.title);
          return (
            <TR key={r.id} className={r.overdue ? "border-l-4 border-l-red-500" : "border-l-4 border-l-teal-600"}>
              <TD>
                <p className="font-medium text-brand">{muaName}</p>
                <p className="text-xs text-slate-muted">{r.taskType.replace(/_/g, " ")}</p>
              </TD>
              {showStaff ? <TD>{r.staffName ?? "—"}</TD> : null}
              <TD>
                {new Date(r.dueDate).toLocaleDateString("en-IN")}
                {r.overdue && r.daysOverdue != null ? (
                  <p className="text-xs font-medium text-red-700">{r.daysOverdue}d overdue</p>
                ) : null}
              </TD>
              <TD>
                {pipelineId ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-accent hover:underline"
                    onClick={() => onOpenPipeline(pipelineId)}
                  >
                    Profile
                  </button>
                ) : (
                  <Link href="/sales/tasks" className="text-xs font-medium text-accent hover:underline">
                    Tasks
                  </Link>
                )}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

export function SalesActionBoard({
  closingSoon,
  leftOut,
  dueTodayTasks,
  overdueTasks,
  counts,
  targetsGap,
  month,
  showAssignee,
  focus,
  onFocusChange,
  onOpenPipeline,
}: {
  closingSoon: ActionPipelineRow[];
  leftOut: ActionPipelineRow[];
  dueTodayTasks: ActionTaskRow[];
  overdueTasks: ActionTaskRow[];
  counts: { closingSoon: number; leftOut: number; todayTasks: number; overdueTasks: number };
  targetsGap: { soldRemaining: number; revenueRemaining: number; soldTarget: number; soldActual: number };
  month: string;
  showAssignee?: boolean;
  focus: ActionFocus;
  onFocusChange: (f: ActionFocus) => void;
  onOpenPipeline: (id: string) => void;
}) {
  const filteredLeftOut =
    focus === "stale"
      ? leftOut.filter((r) => r.reasons?.includes("stale"))
      : focus === "untouched"
        ? leftOut.filter((r) => r.reasons?.includes("untouched"))
        : leftOut;

  return (
    <div className="space-y-4">
      {targetsGap.soldRemaining > 0 || targetsGap.revenueRemaining > 0 ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50/80 p-4">
          <p className="text-sm font-semibold text-brand">Gap to target ({month})</p>
          <p className="mt-1 text-sm text-slate-700">
            {targetsGap.soldRemaining > 0 ? (
              <>
                Need <strong>{targetsGap.soldRemaining}</strong> more deal{targetsGap.soldRemaining === 1 ? "" : "s"}
              </>
            ) : null}
            {targetsGap.soldRemaining > 0 && targetsGap.revenueRemaining > 0 ? " · " : null}
            {targetsGap.revenueRemaining > 0 ? (
              <>
                ₹{targetsGap.revenueRemaining.toLocaleString("en-IN")} revenue to close
              </>
            ) : null}
            {targetsGap.soldRemaining <= 0 && targetsGap.revenueRemaining <= 0 ? (
              <>On track for the month ({targetsGap.soldActual}/{targetsGap.soldTarget} sold).</>
            ) : null}
          </p>
          {closingSoon.length > 0 ? (
            <p className="mt-1 text-xs text-slate-muted">
              {closingSoon.length} in Senior Call / Senior Call Done / Confirm / Demo Done — start there.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "all" as const, label: "All priorities" },
            { id: "closing" as const, label: `Closing next (${counts.closingSoon})` },
            { id: "tasks" as const, label: `Tasks (${counts.todayTasks + counts.overdueTasks})` },
            { id: "left_out" as const, label: `Left out (${counts.leftOut})` },
            { id: "stale" as const, label: "Stale only" },
            { id: "untouched" as const, label: "Untouched only" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFocusChange(f.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              focus === f.id
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {(focus === "all" || focus === "closing") && (
        <Card>
          <div className="mb-3">
            <p className="text-sm font-semibold text-brand">Where the next sale is coming from</p>
            <p className="text-xs text-slate-muted">Senior Call → Senior Call Done → Confirm → Demo Done, oldest first.</p>
          </div>
          <SalesPipelineDetailTable
            rows={closingSoon}
            showPrice
            showAssignee={showAssignee}
            onOpenPipeline={onOpenPipeline}
          />
        </Card>
      )}

      {(focus === "all" || focus === "tasks") && (dueTodayTasks.length > 0 || overdueTasks.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {overdueTasks.length > 0 ? (
            <Card>
              <p className="mb-2 text-sm font-semibold text-red-800">Overdue follow-ups ({overdueTasks.length})</p>
              <TaskActionTable rows={overdueTasks} showStaff={showAssignee} onOpenPipeline={onOpenPipeline} />
            </Card>
          ) : null}
          {dueTodayTasks.length > 0 ? (
            <Card>
              <p className="mb-2 text-sm font-semibold text-brand">Due today ({dueTodayTasks.length})</p>
              <TaskActionTable rows={dueTodayTasks} showStaff={showAssignee} onOpenPipeline={onOpenPipeline} />
            </Card>
          ) : null}
        </div>
      )}

      {(focus === "all" || focus === "left_out" || focus === "stale" || focus === "untouched") && (
        <Card>
          <div className="mb-3">
            <p className="text-sm font-semibold text-brand">Who got left out</p>
            <p className="text-xs text-slate-muted">
              Stale, no contact, untouched, or repeated no-answer — excluding deals already near close.
            </p>
          </div>
          <SalesPipelineDetailTable
            rows={filteredLeftOut}
            showReasons
            showAssignee={showAssignee}
            onOpenPipeline={onOpenPipeline}
          />
        </Card>
      )}
    </div>
  );
}

export type ActionFocus = "all" | "closing" | "tasks" | "left_out" | "stale" | "untouched";
