import { isActivationSendBackTaskTitle } from "@/lib/sales-activation-send-back-shared";
import { parsePipelineIdFromTaskTitle } from "@/lib/sales-task-pipeline";
import type { PipelineStage } from "@/lib/types";

export type TodaysFocusKind = "demo" | "confirmed" | "dealClose" | "onboarding" | "activationSendBack";

export type TodaysFocusItem = {
  pipelineId: string;
  muaName: string;
  muaCity: string;
  muaPhone?: string | null;
  muaWhatsapp?: string | null;
  stage: PipelineStage;
  kind: TodaysFocusKind;
  scheduledAt: string;
  overdue: boolean;
  /** Activation send-back reason from activation_log.sent_back_note */
  note?: string | null;
};

export type FocusScheduleInput = string | Date | null | undefined;

export function startOfDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Parse API/DB values as a local calendar date (avoids UTC midnight shifting the day). */
export function parseCalendarDate(value: FocusScheduleInput): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return startOfDay(value);
  }
  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]) - 1;
    const d = Number(match[3]);
    const parsed = new Date(y, m, d);
    return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

export function calendarDateKey(value: FocusScheduleInput): string | null {
  const d = parseCalendarDate(value);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isDueTodayOrOverdue(date: FocusScheduleInput): boolean {
  const due = parseCalendarDate(date);
  if (!due) return false;
  return due.getTime() <= startOfDay().getTime();
}

export function isDateOverdue(date: FocusScheduleInput): boolean {
  const due = parseCalendarDate(date);
  if (!due) return false;
  return due.getTime() < startOfDay().getTime();
}

export function focusDueLabel(kind: TodaysFocusKind, scheduledAt: string): string {
  const overdue = isDateOverdue(scheduledAt);
  if (overdue) {
    const due = parseCalendarDate(scheduledAt);
    const days = due
      ? Math.round((startOfDay().getTime() - due.getTime()) / 86400000)
      : 0;
    const suffix = days === 1 ? "1 day" : `${days} days`;
    if (kind === "demo") return `Overdue · ${suffix}`;
    if (kind === "confirmed") return `Confirm overdue · ${suffix}`;
    if (kind === "onboarding") return `Onboarding overdue · ${suffix}`;
    if (kind === "activationSendBack") return `Send-back overdue · ${suffix}`;
    return `Close overdue · ${suffix}`;
  }
  if (kind === "demo") return "Demo today";
  if (kind === "confirmed") return "Confirm today";
  if (kind === "onboarding") return "Onboarding today";
  if (kind === "activationSendBack") return "Fix training";
  return "Deal close today";
}

export function focusKindLabel(kind: TodaysFocusKind): string {
  if (kind === "demo") return "Demo";
  if (kind === "confirmed") return "Confirmed";
  if (kind === "onboarding") return "Onboarding";
  if (kind === "activationSendBack") return "Activation send-back";
  return "Deal close";
}

function muaNameFromSendBackTaskTitle(title: string): string | null {
  const m = title.match(/Activation send-back —\s*(.+?)\s*\[PIPE:/i);
  return m?.[1]?.trim() ?? null;
}

function muaNameFromOnboardingTaskTitle(title: string): string | null {
  const m = title.match(/Onboarding checklist —\s*(.+?)\s*\[PIPE:/i);
  return m?.[1]?.trim() ?? null;
}

/** Pending onboarding CRM tasks — actionable until checklists + training are done. */
export function buildOnboardingFocusItems(
  tasks: Array<{
    taskType: string;
    title: string;
    dueDate?: string | null;
    salesPipelineId?: string | null;
    salesPipelineMuaName?: string | null;
    salesPipelineMuaCity?: string | null;
    salesPipelineMuaPhone?: string | null;
    salesPipelineMuaWhatsapp?: string | null;
    salesPipelineStage?: PipelineStage | null;
  }>,
): TodaysFocusItem[] {
  const items: TodaysFocusItem[] = [];
  const seen = new Set<string>();

  for (const t of tasks) {
    if (t.taskType !== "salesOnboarding") continue;
    const pipelineId = t.salesPipelineId ?? parsePipelineIdFromTaskTitle(t.title);
    if (!pipelineId || seen.has(pipelineId)) continue;
    seen.add(pipelineId);

    const dueKey = calendarDateKey(t.dueDate) ?? calendarDateKey(new Date());
    const scheduledAt = dueKey ?? new Date().toISOString().slice(0, 10);

    items.push({
      pipelineId,
      muaName: t.salesPipelineMuaName ?? muaNameFromOnboardingTaskTitle(t.title) ?? "MUA",
      muaCity: t.salesPipelineMuaCity ?? "",
      muaPhone: t.salesPipelineMuaPhone,
      muaWhatsapp: t.salesPipelineMuaWhatsapp,
      stage: t.salesPipelineStage ?? "Onboarding",
      kind: "onboarding",
      scheduledAt,
      overdue: t.dueDate ? isDateOverdue(t.dueDate) : false,
    });
  }

  return items;
}

/** Pending activation send-back tasks — fix training on checklists until saved. */
export function buildActivationSendBackFocusItems(
  tasks: Array<{
    taskType: string;
    title: string;
    dueDate?: string | null;
    salesPipelineId?: string | null;
    salesPipelineMuaName?: string | null;
    salesPipelineMuaCity?: string | null;
    salesPipelineMuaPhone?: string | null;
    salesPipelineMuaWhatsapp?: string | null;
    salesPipelineStage?: PipelineStage | null;
    activationSentBack?: boolean | null;
    activationSentBackNote?: string | null;
  }>,
): TodaysFocusItem[] {
  const items: TodaysFocusItem[] = [];
  const seen = new Set<string>();

  for (const t of tasks) {
    if (t.taskType !== "salesFollowUp") continue;
    if (!isActivationSendBackTaskTitle(t.title) && !t.activationSentBack) continue;
    const pipelineId = t.salesPipelineId ?? parsePipelineIdFromTaskTitle(t.title);
    if (!pipelineId || seen.has(pipelineId)) continue;
    seen.add(pipelineId);

    const dueKey = calendarDateKey(t.dueDate) ?? calendarDateKey(new Date());
    const scheduledAt = dueKey ?? new Date().toISOString().slice(0, 10);
    const note = String(t.activationSentBackNote ?? "").trim() || null;

    items.push({
      pipelineId,
      muaName: t.salesPipelineMuaName ?? muaNameFromSendBackTaskTitle(t.title) ?? "MUA",
      muaCity: t.salesPipelineMuaCity ?? "",
      muaPhone: t.salesPipelineMuaPhone,
      muaWhatsapp: t.salesPipelineMuaWhatsapp,
      stage: t.salesPipelineStage ?? "Deal Closed",
      kind: "activationSendBack",
      scheduledAt,
      overdue: t.dueDate ? isDateOverdue(t.dueDate) : false,
      note,
    });
  }

  return items;
}

export function muaInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function isDemoDueTodayOrOverdue(
  stage: PipelineStage,
  demoScheduledAt: FocusScheduleInput,
): boolean {
  return stage === "Demo Scheduled" && isDueTodayOrOverdue(demoScheduledAt);
}

export function buildTodaysFocusItems(rows: Array<{
  id: string;
  muaName: string;
  muaCity: string;
  muaPhone?: string | null;
  muaWhatsapp?: string | null;
  stage: PipelineStage;
  demoScheduledAt?: FocusScheduleInput;
  confirmScheduledAt?: FocusScheduleInput;
  dealCloseScheduledAt?: FocusScheduleInput;
}>): TodaysFocusItem[] {
  const items: TodaysFocusItem[] = [];

  const base = (r: (typeof rows)[number]) => ({
    pipelineId: r.id,
    muaName: r.muaName,
    muaCity: r.muaCity,
    muaPhone: r.muaPhone,
    muaWhatsapp: r.muaWhatsapp,
    stage: r.stage,
  });

  for (const r of rows) {
    const demoKey = calendarDateKey(r.demoScheduledAt);
    if (isDemoDueTodayOrOverdue(r.stage, r.demoScheduledAt) && demoKey) {
      items.push({
        ...base(r),
        kind: "demo",
        scheduledAt: demoKey,
        overdue: isDateOverdue(r.demoScheduledAt),
      });
    }

    const confirmKey = calendarDateKey(r.confirmScheduledAt);
    const dealCloseKey = calendarDateKey(r.dealCloseScheduledAt);

    if (r.stage === "Confirm" && confirmKey && isDueTodayOrOverdue(r.confirmScheduledAt)) {
      items.push({
        ...base(r),
        kind: "confirmed",
        scheduledAt: confirmKey,
        overdue: isDateOverdue(r.confirmScheduledAt),
      });
    }

    if (
      r.stage === "Confirm" &&
      dealCloseKey &&
      isDueTodayOrOverdue(r.dealCloseScheduledAt) &&
      dealCloseKey !== confirmKey
    ) {
      items.push({
        ...base(r),
        kind: "dealClose",
        scheduledAt: dealCloseKey,
        overdue: isDateOverdue(r.dealCloseScheduledAt),
      });
    } else if (
      r.stage === "Confirm" &&
      dealCloseKey &&
      isDueTodayOrOverdue(r.dealCloseScheduledAt) &&
      dealCloseKey === confirmKey
    ) {
      // Same calendar day — show the actionable close card, not duplicate confirmed.
      const alreadyConfirmed = items.some(
        (i) => i.pipelineId === r.id && i.kind === "confirmed",
      );
      if (alreadyConfirmed) {
        const idx = items.findIndex((i) => i.pipelineId === r.id && i.kind === "confirmed");
        if (idx >= 0) items.splice(idx, 1);
      }
      if (!items.some((i) => i.pipelineId === r.id && i.kind === "dealClose")) {
        items.push({
          ...base(r),
          kind: "dealClose",
          scheduledAt: dealCloseKey,
          overdue: isDateOverdue(r.dealCloseScheduledAt),
        });
      }
    }
  }

  return items.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export function mergeTodaysFocusItems(
  scheduleItems: TodaysFocusItem[],
  salesTasks: Parameters<typeof buildOnboardingFocusItems>[0] &
    Parameters<typeof buildActivationSendBackFocusItems>[0],
): TodaysFocusItem[] {
  const onboarding = buildOnboardingFocusItems(salesTasks);
  const sendBack = buildActivationSendBackFocusItems(salesTasks);
  const merged = [...scheduleItems];
  for (const item of [...onboarding, ...sendBack]) {
    if (!merged.some((i) => i.pipelineId === item.pipelineId && i.kind === item.kind)) {
      merged.push(item);
    }
  }
  return merged.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export function isTodaysFocusPipeline(
  row: { id: string },
  items: TodaysFocusItem[],
): boolean {
  return items.some((i) => i.pipelineId === row.id);
}
