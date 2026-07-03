import type { OverviewSection } from "@/lib/download-overview-csv";
import type { AdminFeedbackOverview } from "@/lib/admin-feedback-overview-query";
import { overviewDateRangeLabel } from "@/lib/admin-overview-date-range";

function formatSentiment(status: string, sentiment: string | null): string {
  if (status === "connected" && sentiment) return sentiment;
  return status.replace(/_/g, " ");
}

export function buildFeedbackOverviewSections(data: AdminFeedbackOverview): OverviewSection[] {
  const {
    dateRange,
    queue,
    period,
    outcomes,
    referrals,
    queueToCall,
    queueNoContact,
    followUpsDue,
    feedbackMuaBookings,
    recentFeedbacks,
    pendingReferrals,
    staff,
  } = data;
  const staffTotals = {
    feedbacks: staff.reduce((n, s) => n + s.feedbacksMtd, 0),
    referrals: staff.reduce((n, s) => n + s.referralsMtd, 0),
    notAnswered: staff.reduce((n, s) => n + s.notAnsweredMtd, 0),
    notInterested: staff.reduce((n, s) => n + s.notInterestedMtd, 0),
    muaProspects: staff.reduce((n, s) => n + s.muaProspectsMtd, 0),
    openTasks: staff.reduce((n, s) => n + s.openTasks, 0),
    overdue: staff.reduce((n, s) => n + s.overdueTasks, 0),
    calls: staff.reduce((n, s) => n + s.callsMtd, 0),
  };

  return [
    {
      title: `Feedback overview — exported ${new Date().toLocaleString("en-IN")}`,
      rows: [["Date range", overviewDateRangeLabel(dateRange)]],
    },
    {
      title: "Queue snapshot (current)",
      headers: ["Metric", "Value"],
      rows: [
        ["Eligible post-event leads", queue.eligibleLeads],
        ["To call", queue.toCall],
        ["No contact", queue.noContact],
        ["Open follow-ups", queue.openFollowUps],
        ["Follow-ups due today+", queue.followUpsDue],
      ],
    },
    {
      title: "Leads waiting for first call",
      headers: ["Lead", "Bride", "Location", "Attempts", "Unreachable", "Last try"],
      rows: queueToCall.map((row) => [
        row.displayId,
        row.brideName,
        row.eventCity ?? row.city ?? "—",
        row.attemptCount,
        row.unreachableAttemptCount,
        row.lastFeedbackAt ? row.lastFeedbackAt.slice(0, 10) : "Never",
      ]),
    },
    {
      title: "Follow-ups due or overdue",
      headers: ["Lead", "Bride", "Assigned to", "Due", "Overdue", "Task"],
      rows: followUpsDue.map((row) => [
        row.displayId,
        row.brideName,
        row.staffName,
        row.dueDate,
        row.overdue ? "yes" : "no",
        row.taskTitle,
      ]),
    },
    {
      title: "Closed — no contact (sample)",
      headers: ["Lead", "Bride", "Location", "Attempts", "Last try"],
      rows: queueNoContact.map((row) => [
        row.displayId,
        row.brideName,
        row.eventCity ?? row.city ?? "—",
        row.attemptCount,
        row.lastFeedbackAt ? row.lastFeedbackAt.slice(0, 10) : "Never",
      ]),
    },
    {
      title: `Period activity (${overviewDateRangeLabel(dateRange)})`,
      headers: ["Metric", "Value"],
      rows: [
        ["Feedbacks", period.feedbacks],
        ["Referrals captured", period.referrals],
        ["MUA prospects", period.muaProspects],
        ["MUA bookings via feedback", period.feedbackMuaBookings],
        ["Referrals converted", period.referralsConverted],
      ],
    },
    {
      title: `MUA bookings via feedback (${overviewDateRangeLabel(dateRange)})`,
      headers: ["Lead", "Bride", "MUA", "MUA ID", "Ceremony", "Event date", "Captured", "By"],
      rows: feedbackMuaBookings.map((row) => [
        row.displayId,
        row.brideName,
        row.muaName,
        row.muaDisplayId ?? "—",
        row.ceremonyType ?? "—",
        row.eventDate ?? "—",
        row.capturedAt.slice(0, 10),
        row.submittedByName ?? "—",
      ]),
    },
    {
      title: `Referral pipeline (period: ${overviewDateRangeLabel(dateRange)})`,
      headers: ["Status", "Count"],
      rows: [
        ["Pending intake", referrals.pending],
        ["Picked up", referrals.pickedUp],
        ["Converted", referrals.converted],
        ["Dismissed", referrals.dismissed],
      ],
    },
    {
      title: `Outcomes (team, ${overviewDateRangeLabel(dateRange)})`,
      headers: ["Metric", "Value"],
      rows: [
        ["Connected feedbacks", outcomes.connectedFeedbacks],
        ["Positive", outcomes.positive],
        ["Negative", outcomes.negative],
        ["Mixed", outcomes.mixed],
        ["Not answered", outcomes.notAnswered],
        ["Not interested", outcomes.notInterested],
        ["Avg Olready rating", outcomes.avgOlreadyRating ?? "—"],
        ["Avg MUA rating", outcomes.avgMuaRating ?? "—"],
        ["Bride referrals", outcomes.brideReferrals],
        ["Referrals converted", outcomes.referralsConverted],
        ["Outside MUAs", outcomes.outsideMuas],
        ["Care tickets raised", outcomes.careTicketsRaised],
        ["Engage again — yes", outcomes.engageAgainYes],
        ["Engage again — maybe", outcomes.engageAgainMaybe],
        ["Engage again — no", outcomes.engageAgainNo],
      ],
    },
    {
      title: `Team totals (${overviewDateRangeLabel(dateRange)})`,
      headers: ["Metric", "Value"],
      rows: [
        ["Feedbacks", staffTotals.feedbacks],
        ["Referrals", staffTotals.referrals],
        ["Not answered attempts", staffTotals.notAnswered],
        ["Not interested", staffTotals.notInterested],
        ["MUA prospects", staffTotals.muaProspects],
        ["Open tasks", staffTotals.openTasks],
        ["Overdue tasks", staffTotals.overdue],
        ["Calls", staffTotals.calls],
      ],
    },
    {
      title: "Team performance",
      headers: [
        "Member",
        "Feedbacks",
        "Referrals",
        "Not answered",
        "Not interested",
        "MUA prospects",
        "Open tasks",
        "Due today+",
        "Overdue",
        "Calls",
        "Talk min",
      ],
      rows: staff.map((row) => [
        row.name,
        row.feedbacksMtd,
        row.referralsMtd,
        row.notAnsweredMtd,
        row.notInterestedMtd,
        row.muaProspectsMtd,
        row.openTasks,
        row.followUpsDue,
        row.overdueTasks,
        row.callsMtd,
        row.talkMinutesMtd,
      ]),
    },
    {
      title: `Recent feedbacks (${overviewDateRangeLabel(dateRange)})`,
      headers: [
        "Lead",
        "Bride",
        "Outcome",
        "Booked with",
        "Olready",
        "MUA",
        "Note",
        "Submitted by",
        "Date",
      ],
      rows: recentFeedbacks.map((row) => [
        row.displayId,
        row.brideName,
        formatSentiment(row.connectionStatus, row.serviceSentiment),
        row.muaType === "non_olready"
          ? row.nonOlreadyMuaName ?? "Outside MUA"
          : row.olreadyMuaName ?? "Olready MUA",
        row.olreadyRating ?? "—",
        row.muaRating ?? "—",
        row.noteSnippet ?? "—",
        row.submittedByName ?? "—",
        row.createdAt.slice(0, 10),
      ]),
    },
    {
      title: "Pending referral intake",
      headers: ["Type", "Referral", "Phone", "Source lead", "Source ID", "Captured by", "Added"],
      rows: pendingReferrals.map((row) => [
        row.kind === "mua" ? "MUA" : "Bride",
        row.referralName,
        row.referralPhone ?? "—",
        row.sourceLeadName,
        row.sourceLeadDisplayId,
        row.capturedByName ?? "—",
        row.createdAt.slice(0, 10),
      ]),
    },
  ];
}
