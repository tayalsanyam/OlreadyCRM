"use client";

import { useMemo } from "react";
import { formatDate, cn } from "@/lib/utils";
import type { CommEntry, CommEntryType } from "@/lib/types";

const MILESTONE_TYPES: CommEntryType[] = [
  "leadCreated",
  "leadVerified",
  "assigned",
  "stageUpdated",
  "bookingConfirmed",
  "shiftedCommission",
  "hostileFlagged",
];

const STAGE_LABELS: Record<string, string> = {
  initialContact: "Initial contact",
  offerSent: "Offer sent",
  followUpDone: "Follow-up done",
  negotiating: "Negotiating",
  brideSelected: "Bride selected",
};

interface Milestone {
  id: string;
  label: string;
  dateLabel: string;
  actorName?: string | null;
  reached: boolean;
  current: boolean;
  terminal?: "booked" | "exit";
}

interface StageTimelineProps {
  comms: CommEntry[];
  leadStatus: string;
}

function formatStageFromMeta(c: CommEntry): string {
  const stage = c.metadata?.stage as string | undefined;
  if (stage && STAGE_LABELS[stage]) return STAGE_LABELS[stage];
  if (c.entryType === "stageUpdated") return "Stage updated";
  return c.description;
}

export function StageTimeline({ comms, leadStatus }: StageTimelineProps) {
  const milestones = useMemo(() => {
    const sorted = [...comms].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const items: Milestone[] = [];
    let pushRun = 0;
    let pushStart: string | null = null;
    let pushEnd: string | null = null;

    function flushPushes() {
      if (pushRun === 0) return;
      items.push({
        id: `pushes-${pushStart}`,
        label:
          pushRun === 1
            ? "1 MUA offered"
            : `${pushRun} MUAs offered`,
        dateLabel:
          pushStart === pushEnd || !pushEnd
            ? formatDate(pushStart!)
            : `${formatDate(pushStart!)} – ${formatDate(pushEnd!)}`,
        reached: true,
        current: false,
      });
      pushRun = 0;
      pushStart = null;
      pushEnd = null;
    }

    for (const c of sorted) {
      if (c.entryType === "muaPushed") {
        pushRun++;
        if (!pushStart) pushStart = c.createdAt;
        pushEnd = c.createdAt;
        continue;
      }
      flushPushes();

      if (!MILESTONE_TYPES.includes(c.entryType)) continue;

      let label = c.description;
      if (c.entryType === "leadCreated") label = "Lead created";
      else if (c.entryType === "leadVerified") label = "Verified";
      else if (c.entryType === "assigned") label = "Assigned";
      else if (c.entryType === "stageUpdated")
        label = formatStageFromMeta(c);
      else if (c.entryType === "bookingConfirmed") label = "Booked";
      else if (c.entryType === "shiftedCommission") label = "Shifted to commission";
      else if (c.entryType === "hostileFlagged") label = "Not answering flagged";

      items.push({
        id: c.id,
        label,
        dateLabel: formatDate(c.createdAt),
        actorName: c.actorName,
        reached: true,
        current: false,
        terminal:
          c.entryType === "bookingConfirmed"
            ? "booked"
            : c.entryType === "shiftedCommission" ||
                c.entryType === "hostileFlagged"
              ? "exit"
              : undefined,
      });
    }
    flushPushes();

    if (items.length > 0) {
      const lastIdx = items.length - 1;
      if (leadStatus === "booked" && items[lastIdx].terminal !== "booked") {
        items[lastIdx].current = leadStatus === "booked";
      } else if (
        !["booked", "archived", "commissionRm"].includes(leadStatus)
      ) {
        items[lastIdx].current = true;
      } else {
        items[lastIdx].current = true;
      }
    }

    return items;
  }, [comms, leadStatus]);

  if (milestones.length === 0) {
    return (
      <p className="text-sm text-slate-muted">No stage history yet.</p>
    );
  }

  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:flex-wrap sm:gap-4">
      {milestones.map((m, i) => (
        <li
          key={m.id}
          className={cn(
            "relative flex min-w-0 flex-1 flex-col border-l-2 border-slate-200 pl-4 pb-4 sm:border-l-0 sm:border-t-2 sm:pt-4 sm:pl-0 sm:pb-0",
            i < milestones.length - 1 && "sm:pr-2"
          )}
        >
          <span
            className={cn(
              "absolute -left-[5px] top-0 h-2.5 w-2.5 rounded-full sm:-top-[5px] sm:left-0",
              m.reached
                ? m.terminal === "booked"
                  ? "bg-emerald-500"
                  : m.terminal === "exit"
                    ? "bg-slate-400"
                    : "bg-accent"
                : "bg-slate-200",
              m.current && "ring-2 ring-accent ring-offset-2 animate-pulse"
            )}
          />
          <p
            className={cn(
              "text-sm font-medium",
              m.terminal === "booked"
                ? "text-emerald-700"
                : m.reached
                  ? "text-brand"
                  : "text-slate-400"
            )}
          >
            {m.label}
            {m.terminal === "booked" && " ✓"}
          </p>
          <p className="text-xs text-slate-muted">{m.dateLabel}</p>
          {m.actorName && (
            <p className="text-xs text-slate-muted">by {m.actorName}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
