import {
  type DayEndPayload,
  type DayEndTemplateKey,
  type UploaderCallyzerTouch,
  formatTalkTime,
  leadUploaderReferralWorkedLabel,
} from "@/lib/day-end";
import type { DayEndConsolidatedRow } from "@/lib/day-end-queries";
import type { OverviewSection } from "@/lib/download-overview-csv";
import { csvDateTimeCell } from "@/lib/utils";

export const DAY_END_TEMPLATE_LABELS: Record<DayEndTemplateKey, string> = {
  sales: "Sales",
  sales_ops: "Sales Ops",
  lead_uploader: "Lead Uploader",
  activation: "Activation",
  feedback: "Feedback",
  rm: "Regional RM",
  commission: "Commission",
  care: "Care",
};

export type DayEndPayloadSummary = {
  calls: number | null;
  talkTimeSec: number | null;
  highlights: string;
};

const STAFF_COLS = ["Staff", "Role", "Report date"] as const;

function countArray(payload: Record<string, unknown>, key: string): number {
  const v = payload[key];
  return Array.isArray(v) ? v.length : 0;
}

function asRecord(payload: DayEndPayload): Record<string, unknown> {
  return payload as Record<string, unknown>;
}

function asArray<T>(payload: Record<string, unknown>, key: string): T[] {
  const v = payload[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function fmtCallyzer(c: UploaderCallyzerTouch | null | undefined): string {
  if (!c) return "—";
  const parts = [
    c.direction ?? "",
    formatTalkTime(c.durationSec),
    c.calledAt ? csvDateTimeCell(c.calledAt) : "",
  ].filter(Boolean);
  return parts.join(" · ") || "—";
}

function fmtTarget(t: { target?: number; achieved?: number; gap?: number } | undefined): string {
  if (!t) return "—";
  return `${t.achieved ?? 0}/${t.target ?? 0} (gap ${t.gap ?? 0})`;
}

function staffPrefix(
  row: DayEndConsolidatedRow,
  roleLabels: Record<string, string>,
): [string, string, string] {
  return [
    row.staffName,
    roleLabels[row.staffRole] ?? row.staffRole,
    row.reportDate,
  ];
}

function pushSection(
  sections: OverviewSection[],
  title: string,
  headers: string[],
  rows: unknown[][],
) {
  if (rows.length === 0) return;
  sections.push({ title, headers, rows });
}

export function summarizeDayEndPayload(
  templateKey: DayEndTemplateKey,
  payload: DayEndPayload,
): DayEndPayloadSummary {
  const p = asRecord(payload);

  switch (templateKey) {
    case "sales": {
      const auto = (p.autoSummary ?? {}) as Record<string, number>;
      return {
        calls: auto.callsMade ?? null,
        talkTimeSec: null,
        highlights: [
          `Revenue ₹${Number(p.todaysRevenue ?? 0).toLocaleString("en-IN")}`,
          `Demos/follow-ups ${auto.demosFollowUps ?? 0}`,
          `Confirmed MUAs ${countArray(p, "confirmedMuas")}`,
          `Details shared ${countArray(p, "detailsSharedToday")}`,
          `Deals closed ${countArray(p, "dealsClosedToday")}`,
        ].join(" · "),
      };
    }
    case "sales_ops":
      return {
        calls: Number(p.callsMade ?? 0),
        talkTimeSec: null,
        highlights: [
          `Tasks closed ${p.tasksClosed ?? 0}`,
          `Queue actions ${p.queueActions ?? 0}`,
        ].join(" · "),
      };
    case "lead_uploader":
      return {
        calls: Number(p.callsMade ?? 0),
        talkTimeSec: Number(p.talkTimeSec ?? 0),
        highlights: [
          `Leads uploaded ${p.leadsUploaded ?? 0}`,
          `Verified ${countArray(p, "leadsVerifiedToday")}`,
          `Re-verified ${countArray(p, "leadsReVerifiedToday")}`,
          `Referrals worked ${countArray(p, "feedbackReferralsAdded")}`,
        ].join(" · "),
      };
    case "activation":
      return {
        calls: Number(p.callsMade ?? 0),
        talkTimeSec: Number(p.talkTimeSec ?? 0),
        highlights: [
          `Plans activated ${countArray(p, "plansActivatedToday")}`,
          `Queue ${countArray(p, "activationQueue")}`,
        ].join(" · "),
      };
    case "feedback":
      return {
        calls: Number(p.callsMade ?? 0),
        talkTimeSec: Number(p.talkTimeSec ?? 0),
        highlights: [
          `Contacted ${p.contactedToday ?? 0}`,
          `Queue ${p.postEventLeadsInQueue ?? 0}`,
          `Feedback given ${countArray(p, "feedbackGivenToday")}`,
        ].join(" · "),
      };
    case "rm":
      return {
        calls: Number(p.callsToday ?? 0),
        talkTimeSec: Number(p.talkTimeSec ?? 0),
        highlights: [
          `Bookings ${p.bookingsToday ?? 0}`,
          `Push ${p.pushToday ?? 0}`,
          `MUAs worked ${countArray(p, "muasWorkedToday")}`,
          `Stale plan MUAs ${countArray(p, "stalePlanMuasNotPushed")}`,
        ].join(" · "),
      };
    case "commission":
      return {
        calls: Number(p.callsToday ?? 0),
        talkTimeSec: Number(p.talkTimeSec ?? 0),
        highlights: [
          `Bookings ${p.bookingsToday ?? 0}`,
          `Commission ₹${Number(p.commissionEarnedToday ?? 0).toLocaleString("en-IN")}`,
          `Payments ₹${Number(p.paymentsReceivedToday ?? 0).toLocaleString("en-IN")}`,
        ].join(" · "),
      };
    case "care":
      return {
        calls: Number(p.callsMade ?? 0),
        talkTimeSec: Number(p.talkTimeSec ?? 0),
        highlights: [
          `Open tickets ${p.totalOpenTickets ?? 0}`,
          `L2/L3 ${p.openL2L3Count ?? 0}`,
          `Closed today ${countArray(p, "ticketsClosedToday")}`,
          `Callyzer MUAs ${countArray(p, "callyzerMuaContacts")}`,
        ].join(" · "),
      };
    default:
      return { calls: null, talkTimeSec: null, highlights: "" };
  }
}

function flattenSalesDetails(
  rows: DayEndConsolidatedRow[],
  roleLabels: Record<string, string>,
  sections: OverviewSection[],
) {
  const statsRows: unknown[][] = [];
  const confirmedRows: unknown[][] = [];
  const demoRows: unknown[][] = [];
  const detailsSharedRows: unknown[][] = [];
  const dealsClosedRows: unknown[][] = [];
  const issueRows: unknown[][] = [];

  for (const row of rows) {
    const p = asRecord(row.payload);
    const auto = (p.autoSummary ?? {}) as Record<string, number>;
    const prefix = staffPrefix(row, roleLabels);
    const tva = p.targetsVsAchieved as { target?: number; achieved?: number; gap?: number };
    const soldTva = p.soldTargetsVsAchieved as { target?: number; achieved?: number; gap?: number };

    statsRows.push([
      ...prefix,
      fmtTarget(tva),
      fmtTarget(soldTva),
      p.lastDealClosedDate ?? "—",
      p.todaysRevenue ?? 0,
      auto.callsMade ?? 0,
      auto.demosFollowUps ?? 0,
      auto.pipelineMoves ?? 0,
    ]);

    for (const m of asArray<Record<string, unknown>>(p, "confirmedMuas")) {
      confirmedRows.push([
        ...prefix,
        m.muaName ?? "",
        m.stage ?? "",
        m.lastContact ?? "—",
        m.detail ?? "",
      ]);
    }
    for (const m of asArray<Record<string, unknown>>(p, "demosScheduledToday")) {
      demoRows.push([...prefix, m.muaName ?? "", m.stage ?? "", m.detail ?? ""]);
    }
    for (const m of asArray<Record<string, unknown>>(p, "detailsSharedToday")) {
      detailsSharedRows.push([
        ...prefix,
        m.muaName ?? "",
        m.stage ?? "",
        m.lastContact ?? "—",
        m.detail ?? "",
      ]);
    }
    for (const m of asArray<Record<string, unknown>>(p, "dealsClosedToday")) {
      dealsClosedRows.push([
        ...prefix,
        m.muaName ?? "",
        m.stage ?? "",
        m.lastContact ?? "—",
        m.detail ?? "",
      ]);
    }
    for (const m of asArray<Record<string, unknown>>(p, "issuesDiscussion")) {
      issueRows.push([...prefix, m.muaName ?? "", m.detail ?? ""]);
    }
  }

  pushSection(sections, "Sales — daily stats", [...STAFF_COLS, "Revenue target vs achieved", "Deals target vs achieved", "Last deal closed", "Revenue", "Calls", "Demos/follow-ups", "Pipeline moves"], statsRows);
  pushSection(sections, "Sales — confirmed MUAs", [...STAFF_COLS, "MUA", "Stage", "Last contact", "Detail"], confirmedRows);
  pushSection(sections, "Sales — demos scheduled", [...STAFF_COLS, "MUA", "Stage", "Detail"], demoRows);
  pushSection(sections, "Sales — details shared today", [...STAFF_COLS, "MUA", "Stage", "Shared at", "Detail"], detailsSharedRows);
  pushSection(sections, "Sales — deals closed today", [...STAFF_COLS, "MUA", "Stage", "Closed at", "Detail"], dealsClosedRows);
  pushSection(sections, "Sales — issues for discussion", [...STAFF_COLS, "MUA", "Detail"], issueRows);
}

function flattenSalesOpsDetails(
  rows: DayEndConsolidatedRow[],
  roleLabels: Record<string, string>,
  sections: OverviewSection[],
) {
  const detailRows: unknown[][] = [];
  for (const row of rows) {
    const p = asRecord(row.payload);
    detailRows.push([
      ...staffPrefix(row, roleLabels),
      p.callsMade ?? 0,
      p.tasksClosed ?? 0,
      p.queueActions ?? 0,
      p.notes ?? "",
      p.manualNotes ?? "",
    ]);
  }
  pushSection(sections, "Sales ops — activity", [...STAFF_COLS, "Calls", "Tasks closed", "Queue actions", "Notes", "Manual notes"], detailRows);
}

function flattenLeadUploaderDetails(
  rows: DayEndConsolidatedRow[],
  roleLabels: Record<string, string>,
  sections: OverviewSection[],
) {
  const statsRows: unknown[][] = [];
  const leadHeaders = [...STAFF_COLS, "Lead ID", "Bride", "Detail", "Callyzer", "No Callyzer log", "Remarks"] as const;

  const verified: unknown[][] = [];
  const reVerified: unknown[][] = [];
  const notAnswering: unknown[][] = [];
  const closedNi: unknown[][] = [];
  const referrals: unknown[][] = [];

  for (const row of rows) {
    const p = asRecord(row.payload);
    statsRows.push([
      ...staffPrefix(row, roleLabels),
      p.callsMade ?? 0,
      formatTalkTime(Number(p.talkTimeSec ?? 0)),
      p.leadsUploaded ?? 0,
      p.tasksCompleted ?? 0,
    ]);

    const pushLeads = (target: unknown[][], key: string) => {
      for (const l of asArray<Record<string, unknown>>(p, key)) {
        target.push([
          ...staffPrefix(row, roleLabels),
          l.displayId ?? l.leadId ?? "",
          l.brideName ?? "",
          l.detail ?? "",
          fmtCallyzer(l.callyzer as UploaderCallyzerTouch | null),
          l.workedWithoutCallyzer ? "Yes" : "No",
          l.remarks ?? "",
        ]);
      }
    };

    pushLeads(verified, "leadsVerifiedToday");
    pushLeads(reVerified, "leadsReVerifiedToday");
    pushLeads(notAnswering, "notAnsweringToday");
    pushLeads(closedNi, "closedNotInterestedToday");

    for (const r of asArray<Record<string, unknown>>(p, "feedbackReferralsAdded")) {
      referrals.push([
        ...staffPrefix(row, roleLabels),
        r.referralName ?? "",
        r.referralPhone ?? "—",
        leadUploaderReferralWorkedLabel(
          r.status as "picked_up" | "converted" | "dismissed"
        ),
        r.sourceBrideName ?? "",
        r.notes ?? "",
      ]);
    }
  }

  pushSection(sections, "Lead uploader — daily stats", [...STAFF_COLS, "Calls", "Talk time", "Leads uploaded", "Tasks completed"], statsRows);
  pushSection(sections, "Lead uploader — verified today", [...leadHeaders], verified);
  pushSection(sections, "Lead uploader — re-verified today", [...leadHeaders], reVerified);
  pushSection(sections, "Lead uploader — not answering", [...leadHeaders], notAnswering);
  pushSection(sections, "Lead uploader — closed (not interested)", [...leadHeaders], closedNi);
  pushSection(sections, "Lead uploader — referrals worked today", [...STAFF_COLS, "Referral", "Phone", "Outcome", "Source bride", "Notes"], referrals);
}

function flattenActivationDetails(
  rows: DayEndConsolidatedRow[],
  roleLabels: Record<string, string>,
  sections: OverviewSection[],
) {
  const statsRows: unknown[][] = [];
  const activated: unknown[][] = [];
  const queue: unknown[][] = [];

  for (const row of rows) {
    const p = asRecord(row.payload);
    statsRows.push([
      ...staffPrefix(row, roleLabels),
      p.callsMade ?? 0,
      formatTalkTime(Number(p.talkTimeSec ?? 0)),
    ]);

    for (const a of asArray<Record<string, unknown>>(p, "plansActivatedToday")) {
      activated.push([
        ...staffPrefix(row, roleLabels),
        a.muaName ?? "",
        a.muaCity ?? "",
        a.plan ?? "",
        a.quotedAmount ?? "—",
        a.invoiceNumber ?? "—",
        (a.cities as string[] | undefined)?.join("; ") ?? "",
        a.remarks ?? "",
      ]);
    }
    for (const q of asArray<Record<string, unknown>>(p, "activationQueue")) {
      queue.push([
        ...staffPrefix(row, roleLabels),
        q.muaName ?? "",
        q.muaCity ?? "",
        q.stageLabel ?? "",
        q.daysInStage ?? "",
        q.assignedSalesName ?? "—",
        (q.pendingActions as string[] | undefined)?.join("; ") ?? "",
        q.remarks ?? "",
      ]);
    }
  }

  pushSection(sections, "Activation — daily stats", [...STAFF_COLS, "Calls", "Talk time"], statsRows);
  pushSection(sections, "Activation — plans activated", [...STAFF_COLS, "MUA", "City", "Plan", "Quoted", "Invoice", "Cities", "Remarks"], activated);
  pushSection(sections, "Activation — queue", [...STAFF_COLS, "MUA", "City", "Stage", "Days in stage", "Assigned sales", "Pending actions", "Remarks"], queue);
}

function flattenFeedbackDetails(
  rows: DayEndConsolidatedRow[],
  roleLabels: Record<string, string>,
  sections: OverviewSection[],
) {
  const statsRows: unknown[][] = [];
  const contactHeaders = [...STAFF_COLS, "Lead ID", "Bride", "Detail", "Callyzer", "No Callyzer log", "Remarks"] as const;
  const followUp: unknown[][] = [];
  const given: unknown[][] = [];
  const refused: unknown[][] = [];
  const brideReferrals: unknown[][] = [];
  const muaReferrals: unknown[][] = [];
  const ratings: unknown[][] = [];

  for (const row of rows) {
    const p = asRecord(row.payload);
    statsRows.push([
      ...staffPrefix(row, roleLabels),
      p.callsMade ?? 0,
      formatTalkTime(Number(p.talkTimeSec ?? 0)),
      p.postEventLeadsInQueue ?? 0,
      p.contactedToday ?? 0,
    ]);

    const pushContacts = (target: unknown[][], key: string) => {
      for (const l of asArray<Record<string, unknown>>(p, key)) {
        target.push([
          ...staffPrefix(row, roleLabels),
          l.displayId ?? l.leadId ?? "",
          l.brideName ?? "",
          l.detail ?? "",
          fmtCallyzer(l.callyzer as UploaderCallyzerTouch | null),
          l.workedWithoutCallyzer ? "Yes" : "No",
          l.remarks ?? "",
        ]);
      }
    };

    pushContacts(followUp, "followUpFromToday");
    pushContacts(given, "feedbackGivenToday");
    pushContacts(refused, "refusedToday");

    for (const r of asArray<Record<string, unknown>>(p, "referralsLeadToday")) {
      brideReferrals.push([
        ...staffPrefix(row, roleLabels),
        r.displayId ?? "",
        r.brideName ?? "",
        r.referralName ?? "",
        r.referralPhone ?? "—",
        r.detail ?? "",
        r.remarks ?? "",
      ]);
    }
    for (const r of asArray<Record<string, unknown>>(p, "referralsMuaToday")) {
      muaReferrals.push([
        ...staffPrefix(row, roleLabels),
        r.brideName ?? "",
        r.muaName ?? "",
        r.phone ?? "—",
        r.city ?? "—",
        r.detail ?? "",
        r.remarks ?? "",
      ]);
    }

    const ratingKeys: { key: string; type: string }[] = [
      { key: "negativeOlreadyToday", type: "Olready negative" },
      { key: "positiveOlreadyToday", type: "Olready positive" },
      { key: "negativeMuaToday", type: "MUA negative" },
      { key: "positiveMuaToday", type: "MUA positive" },
    ];
    for (const { key, type } of ratingKeys) {
      for (const r of asArray<Record<string, unknown>>(p, key)) {
        ratings.push([
          ...staffPrefix(row, roleLabels),
          type,
          r.displayId ?? "",
          r.brideName ?? "",
          r.rating ?? "",
          r.muaName ?? "—",
          r.detail ?? "",
          fmtCallyzer(r.callyzer as UploaderCallyzerTouch | null),
          r.remarks ?? "",
        ]);
      }
    }
  }

  pushSection(sections, "Feedback — daily stats", [...STAFF_COLS, "Calls", "Talk time", "Queue", "Contacted"], statsRows);
  pushSection(sections, "Feedback — follow-up from today", [...contactHeaders], followUp);
  pushSection(sections, "Feedback — feedback given", [...contactHeaders], given);
  pushSection(sections, "Feedback — refused", [...contactHeaders], refused);
  pushSection(sections, "Feedback — bride referrals", [...STAFF_COLS, "Lead ID", "Bride", "Referral", "Phone", "Detail", "Remarks"], brideReferrals);
  pushSection(sections, "Feedback — MUA referrals", [...STAFF_COLS, "Bride", "MUA", "Phone", "City", "Detail", "Remarks"], muaReferrals);
  pushSection(sections, "Feedback — ratings", [...STAFF_COLS, "Type", "Lead ID", "Bride", "Rating", "MUA", "Detail", "Callyzer", "Remarks"], ratings);
}

function flattenRmDetails(
  rows: DayEndConsolidatedRow[],
  roleLabels: Record<string, string>,
  sections: OverviewSection[],
  template: "rm" | "commission",
) {
  const statsRows: unknown[][] = [];
  const pipeline: unknown[][] = [];
  const pushesToday: unknown[][] = [];
  const bookingsToday: unknown[][] = [];
  const muasWorked: unknown[][] = [];
  const stalePlanMuas: unknown[][] = [];
  const conference: unknown[][] = [];
  const label = template === "commission" ? "Commission" : "Regional RM";

  for (const row of rows) {
    const p = asRecord(row.payload);
    const base = [
      ...staffPrefix(row, roleLabels),
      fmtTarget(p.bookingTargetVsAchieved as { target?: number; achieved?: number; gap?: number }),
      fmtTarget(p.pushTargetVsAchieved as { target?: number; achieved?: number; gap?: number }),
      p.bookingsToday ?? 0,
      p.pushToday ?? 0,
      p.privyBookingsToday ?? 0,
      p.privyBookingsMtd ?? 0,
      p.callsToday ?? 0,
      formatTalkTime(Number(p.talkTimeSec ?? 0)),
    ];

    if (template === "commission") {
      statsRows.push([
        ...base,
        fmtTarget(p.commissionTargetVsAchieved as { target?: number; achieved?: number; gap?: number }),
        p.commissionEarnedToday ?? 0,
        p.paymentsReceivedToday ?? 0,
        p.pendingPaymentsMtd ?? 0,
        p.overallPendingPayments ?? 0,
      ]);

      for (const l of asArray<Record<string, unknown>>(p, "pipelinesTomorrow")) {
        const muas = (l.muas as { muaName?: string; selected?: boolean }[] | undefined) ?? [];
        const muaNames = muas
          .filter((m) => m.selected)
          .map((m) => m.muaName ?? "")
          .filter(Boolean)
          .join("; ");
        pipeline.push([
          ...staffPrefix(row, roleLabels),
          l.brideName ?? "",
          l.lastContact ?? "—",
          muaNames || "—",
          l.comments ?? "",
        ]);
      }

      for (const l of asArray<Record<string, unknown>>(p, "allPushesToday")) {
        pushesToday.push([
          ...staffPrefix(row, roleLabels),
          l.brideName ?? "",
          l.muaName ?? "",
          l.ceremonyType ?? "—",
          l.comments ?? "",
        ]);
      }
      for (const l of asArray<Record<string, unknown>>(p, "allBookingsToday")) {
        bookingsToday.push([
          ...staffPrefix(row, roleLabels),
          l.brideName ?? "",
          l.muaName ?? "",
          l.ceremonyType ?? "—",
          l.bookedPrice ?? "—",
          l.comments ?? "",
        ]);
      }
      for (const m of asArray<Record<string, unknown>>(p, "muasWorkedToday")) {
        muasWorked.push([
          ...staffPrefix(row, roleLabels),
          m.muaName ?? "",
          m.stage ?? m.detail ?? "—",
          m.lastContact ?? "—",
          m.detail ?? "",
        ]);
      }
    } else {
      statsRows.push(base);

      for (const l of asArray<Record<string, unknown>>(p, "allPushesToday")) {
        pushesToday.push([
          ...staffPrefix(row, roleLabels),
          l.brideName ?? "",
          l.muaName ?? "",
          l.ceremonyType ?? "—",
          l.comments ?? "",
        ]);
      }
      for (const l of asArray<Record<string, unknown>>(p, "allBookingsToday")) {
        bookingsToday.push([
          ...staffPrefix(row, roleLabels),
          l.brideName ?? "",
          l.muaName ?? "",
          l.ceremonyType ?? "—",
          l.bookedPrice ?? "—",
          l.comments ?? "",
        ]);
      }
      for (const m of asArray<Record<string, unknown>>(p, "muasWorkedToday")) {
        muasWorked.push([
          ...staffPrefix(row, roleLabels),
          m.muaName ?? "",
          m.stage ?? m.detail ?? "—",
          m.lastContact ?? "—",
          m.detail ?? "",
        ]);
      }
      for (const m of asArray<Record<string, unknown>>(p, "stalePlanMuasNotPushed")) {
        stalePlanMuas.push([
          ...staffPrefix(row, roleLabels),
          m.muaName ?? "",
          m.planTier ?? "—",
          m.lastPushedAt ?? "Never",
          m.daysSincePush ?? "—",
          m.comments ?? "",
        ]);
      }
    }

    for (const l of asArray<Record<string, unknown>>(p, "conferenceCalls")) {
      const muas = (l.muas as { muaName?: string; selected?: boolean }[] | undefined) ?? [];
      const muaNames = muas
        .filter((m) => m.selected)
        .map((m) => m.muaName ?? "")
        .filter(Boolean)
        .join("; ");
      conference.push([
        ...staffPrefix(row, roleLabels),
        l.brideName ?? "",
        muaNames || "—",
        l.comments ?? "",
      ]);
    }
  }

  const statsHeaders =
    template === "commission"
      ? [...STAFF_COLS, "Booking target", "Push target", "Bookings today", "Push today", "Privy today", "Privy MTD", "Calls", "Talk time", "Commission target", "Commission today", "Payments today", "Pending MTD", "Overall pending"]
      : [...STAFF_COLS, "Booking target", "Push target", "Bookings today", "Push today", "Privy today", "Privy MTD", "Calls", "Talk time"];

  pushSection(sections, `${label} — daily stats`, statsHeaders, statsRows);
  if (template === "commission") {
    pushSection(
      sections,
      `${label} — pipeline tomorrow`,
      [...STAFF_COLS, "Bride", "Last contact", "MUAs on call", "Comments"],
      pipeline,
    );
    pushSection(
      sections,
      `${label} — all pushes today`,
      [...STAFF_COLS, "Bride", "MUA", "Ceremony", "Comments"],
      pushesToday,
    );
    pushSection(
      sections,
      `${label} — all bookings today`,
      [...STAFF_COLS, "Bride", "MUA", "Ceremony", "Booked price", "Comments"],
      bookingsToday,
    );
    pushSection(
      sections,
      `${label} — MUAs worked today`,
      [...STAFF_COLS, "MUA", "Activity", "Last touch", "Remarks"],
      muasWorked,
    );
  } else {
    pushSection(
      sections,
      `${label} — all pushes today`,
      [...STAFF_COLS, "Bride", "MUA", "Ceremony", "Comments"],
      pushesToday,
    );
    pushSection(
      sections,
      `${label} — all bookings today`,
      [...STAFF_COLS, "Bride", "MUA", "Ceremony", "Booked price", "Comments"],
      bookingsToday,
    );
    pushSection(
      sections,
      `${label} — MUAs worked today`,
      [...STAFF_COLS, "MUA", "Activity", "Last touch", "Remarks"],
      muasWorked,
    );
    pushSection(
      sections,
      `${label} — plan MUAs not pushed 7d+`,
      [...STAFF_COLS, "MUA", "Plan", "Last push", "Days", "Comments"],
      stalePlanMuas,
    );
  }
  pushSection(sections, `${label} — conference calls`, [...STAFF_COLS, "Bride", "MUAs on call", "Comments"], conference);
}

function flattenCareDetails(
  rows: DayEndConsolidatedRow[],
  roleLabels: Record<string, string>,
  sections: OverviewSection[],
) {
  const statsRows: unknown[][] = [];
  const callyzer: unknown[][] = [];
  const closed: unknown[][] = [];
  const listed: unknown[][] = [];
  const addressed: unknown[][] = [];
  const urgent: unknown[][] = [];
  const discussions: unknown[][] = [];
  const chat: unknown[][] = [];
  const manual: unknown[][] = [];

  const ticketHeaders = [...STAFF_COLS, "Ticket", "Party", "Phone", "Issue", "Status", "Today action", "Days open", "Remarks"] as const;

  const pushTicketRows = (
    target: unknown[][],
    prefix: [string, string, string],
    items: Record<string, unknown>[],
  ) => {
    for (const t of items) {
      target.push([
        ...prefix,
        t.ticketNumber ?? "",
        t.partyName ?? t.subject ?? "",
        t.partyPhone ?? "—",
        t.issueSummary ?? t.subject ?? "",
        t.status ?? "—",
        t.todayAction ?? "—",
        t.daysSinceOpen ?? "—",
        t.remarks ?? "",
      ]);
    }
  };

  for (const row of rows) {
    const p = asRecord(row.payload);
    const prefix = staffPrefix(row, roleLabels);

    statsRows.push([
      ...prefix,
      p.totalOpenTickets ?? 0,
      p.callsMade ?? 0,
      formatTalkTime(Number(p.talkTimeSec ?? 0)),
      p.openL2L3Count ?? 0,
      p.tasksDoneToday ?? 0,
      p.pendingTasks ?? 0,
    ]);

    for (const c of asArray<Record<string, unknown>>(p, "callyzerMuaContacts")) {
      callyzer.push([
        ...prefix,
        c.ticketNumber ?? "",
        c.muaName ?? "",
        c.muaPhone ?? "—",
        c.issueSummary ?? "",
        fmtCallyzer(c.callyzer as UploaderCallyzerTouch),
        c.remarks ?? "",
      ]);
    }

    pushTicketRows(closed, prefix, asArray(p, "ticketsClosedToday"));
    pushTicketRows(listed, prefix, asArray(p, "issuesListToday"));
    pushTicketRows(addressed, prefix, asArray(p, "issuesAddressedToday"));
    pushTicketRows(urgent, prefix, asArray(p, "urgentIssues"));
    pushTicketRows(discussions, prefix, asArray(p, "discussionPoints"));
    pushTicketRows(manual, prefix, asArray(p, "manualTickets"));

    for (const c of asArray<Record<string, unknown>>(p, "chatSupportActivity")) {
      chat.push([
        ...prefix,
        c.displayId ?? "",
        c.visitorName ?? "",
        c.visitorKind ?? "",
        c.phone ?? "—",
        c.detail ?? "",
        c.remarks ?? "",
      ]);
    }
  }

  pushSection(sections, "Care — daily stats", [...STAFF_COLS, "Open tickets", "Calls", "Talk time", "L2/L3 open", "Tasks done", "Pending tasks"], statsRows);
  pushSection(sections, "Care — Callyzer MUA contacts", [...STAFF_COLS, "Ticket", "MUA", "Phone", "Issue", "Callyzer", "Remarks"], callyzer);
  pushSection(sections, "Care — tickets closed today", [...ticketHeaders], closed);
  pushSection(sections, "Care — issues listed today", [...ticketHeaders], listed);
  pushSection(sections, "Care — issues addressed today", [...ticketHeaders], addressed);
  pushSection(sections, "Care — urgent L2/L3", [...ticketHeaders], urgent);
  pushSection(sections, "Care — admin discussions", [...ticketHeaders], discussions);
  pushSection(sections, "Care — chat support", [...STAFF_COLS, "ID", "Visitor", "Kind", "Phone", "Detail", "Remarks"], chat);
  pushSection(sections, "Care — manual tickets", [...ticketHeaders], manual);
}

function flattenTemplateDetails(
  templateKey: DayEndTemplateKey,
  rows: DayEndConsolidatedRow[],
  roleLabels: Record<string, string>,
  sections: OverviewSection[],
) {
  switch (templateKey) {
    case "sales":
      flattenSalesDetails(rows, roleLabels, sections);
      break;
    case "sales_ops":
      flattenSalesOpsDetails(rows, roleLabels, sections);
      break;
    case "lead_uploader":
      flattenLeadUploaderDetails(rows, roleLabels, sections);
      break;
    case "activation":
      flattenActivationDetails(rows, roleLabels, sections);
      break;
    case "feedback":
      flattenFeedbackDetails(rows, roleLabels, sections);
      break;
    case "rm":
      flattenRmDetails(rows, roleLabels, sections, "rm");
      break;
    case "commission":
      flattenRmDetails(rows, roleLabels, sections, "commission");
      break;
    case "care":
      flattenCareDetails(rows, roleLabels, sections);
      break;
  }
}

export function consolidatedRowsToCsvSections(
  rows: DayEndConsolidatedRow[],
  roleLabels: Record<string, string>,
  dateRangeLabel?: string,
): OverviewSection[] {
  const summaryHeaders = [
    "Staff",
    "Role",
    "Report date",
    "Template",
    "Submitted at",
    "Calls",
    "Talk time",
    "Highlights",
  ];

  const summaryRows = rows.map((row) => {
    const summary = summarizeDayEndPayload(row.templateKey, row.payload);
    return [
      row.staffName,
      roleLabels[row.staffRole] ?? row.staffRole,
      row.reportDate,
      DAY_END_TEMPLATE_LABELS[row.templateKey] ?? row.templateKey,
      row.submittedAt,
      summary.calls ?? "",
      summary.talkTimeSec != null ? formatTalkTime(summary.talkTimeSec) : "",
      summary.highlights,
    ];
  });

  const sections: OverviewSection[] = [
    {
      title: `Day end consolidated — exported ${new Date().toLocaleString("en-IN")}`,
      rows: [["Date range", dateRangeLabel ?? "—"], ["Reports", rows.length]],
    },
    { title: "Summary (all reports)", headers: summaryHeaders, rows: summaryRows },
  ];

  const byTemplate = new Map<DayEndTemplateKey, DayEndConsolidatedRow[]>();
  for (const row of rows) {
    const list = byTemplate.get(row.templateKey) ?? [];
    list.push(row);
    byTemplate.set(row.templateKey, list);
  }

  const templateOrder: DayEndTemplateKey[] = [
    "sales",
    "sales_ops",
    "lead_uploader",
    "activation",
    "feedback",
    "rm",
    "commission",
    "care",
  ];

  for (const templateKey of templateOrder) {
    const templateRows = byTemplate.get(templateKey);
    if (templateRows?.length) {
      flattenTemplateDetails(templateKey, templateRows, roleLabels, sections);
    }
  }

  return sections;
}
