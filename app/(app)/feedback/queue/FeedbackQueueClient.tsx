"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { ExpiredFeedbackModal } from "@/components/leads/ExpiredFeedbackModal";
import { LeadQuickContact } from "@/components/leads/LeadQuickContact";
import type { FeedbackQueueTab } from "@/lib/feedback-constants";
import type { FeedbackQueueRow } from "@/lib/feedback-queue";
import { BUDGET_TIER_LABELS, LEAD_STATUS_LABELS } from "@/lib/types";
import { formatDate, cn } from "@/lib/utils";

const TABS: { id: FeedbackQueueTab; label: string }[] = [
  { id: "to_call", label: "To call" },
  { id: "follow_ups", label: "Follow-ups" },
  { id: "no_contact", label: "Closed — No contact" },
  { id: "done", label: "Done" },
  { id: "closed", label: "Declined" },
];

type Stats = {
  toCall: number;
  noContact: number;
  followUpsDue: number;
  feedbacksThisMonth: number;
  referralsThisMonth: number;
  muaProspectsThisMonth: number;
  referralsConvertedThisMonth: number;
};

export function FeedbackQueueClient() {
  const [tab, setTab] = useState<FeedbackQueueTab>("to_call");
  const [leads, setLeads] = useState<FeedbackQueueRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FeedbackQueueRow | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void Promise.all([
      fetch(`/api/feedback/queue?tab=${tab}`).then((r) => r.json()),
      fetch("/api/feedback/stats").then((r) => r.json()),
    ]).then(([queueJson, statsJson]) => {
      setLeads((queueJson.data as FeedbackQueueRow[]) ?? []);
      setStats((statsJson.data as Stats) ?? null);
      setLoading(false);
    });
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">Post-event feedback</h1>
        <p className="text-sm text-slate-muted">
          Call brides after their ceremonies (expired or booked) — log outcomes and capture referrals.
        </p>
      </div>

      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <StatCard label="Team · To call" value={stats.toCall} />
          <StatCard label="Team · Closed no contact" value={stats.noContact} />
          <StatCard label="My follow-ups due" value={stats.followUpsDue} highlight />
          <StatCard label="My feedbacks (month)" value={stats.feedbacksThisMonth} />
          <StatCard label="My bride referrals (month)" value={stats.referralsThisMonth} />
          <StatCard label="My outside MUAs (month)" value={stats.muaProspectsThisMonth} />
          <StatCard
            label="My referrals converted"
            value={stats.referralsConvertedThisMonth}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              tab === t.id
                ? "bg-brand text-white"
                : "text-slate-muted hover:bg-slate-100"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>ID</TH>
              <TH>Bride</TH>
              <TH>Contact</TH>
              <TH>City</TH>
              <TH>Expired</TH>
              <TH>Status</TH>
              <TH>Tier</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {leads.length === 0 ? (
              <TR>
                <TD colSpan={8} className="py-8 text-center text-slate-muted">
                  No leads in this tab
                </TD>
              </TR>
            ) : (
              leads.map((l) => (
                <TR key={l.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/rm/leads/${l.id}`}
                      className="text-accent hover:underline"
                    >
                      {l.displayId}
                    </Link>
                  </TD>
                  <TD>
                    <Link
                      href={`/rm/leads/${l.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {l.brideName}
                    </Link>
                  </TD>
                  <TD>
                    <LeadQuickContact
                      leadId={l.id}
                      brideName={l.brideName}
                      phone={l.phone}
                      city={l.eventCity ?? l.city}
                      templatePool="feedback"
                      variant="compact"
                      onLogged={load}
                    />
                  </TD>
                  <TD>{l.city ?? "—"}</TD>
                  <TD className="text-xs text-slate-muted">
                    {l.expiredAt ? formatDate(l.expiredAt) : "—"}
                  </TD>
                  <TD>
                    <Badge variant="muted">
                      {LEAD_STATUS_LABELS[l.status as keyof typeof LEAD_STATUS_LABELS] ??
                        l.status}
                    </Badge>
                  </TD>
                  <TD>{BUDGET_TIER_LABELS[l.budgetTier]}</TD>
                  <TD>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/rm/leads/${l.id}`}>
                        <Button size="sm" variant="secondary">
                          View lead
                        </Button>
                      </Link>
                      {(tab === "to_call" || tab === "follow_ups") && (
                        <Button size="sm" onClick={() => setSelected(l)}>
                          Log call
                        </Button>
                      )}
                      {tab === "no_contact" && (
                        <Badge variant="muted">Closed — no contact</Badge>
                      )}
                      {tab === "done" && (
                        <Badge variant="muted">Feedback saved</Badge>
                      )}
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      )}

      {selected && (
        <ExpiredFeedbackModal
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          leadId={selected.id}
          brideName={selected.brideName}
          unreachableAttemptCount={selected.unreachableAttemptCount}
          onSubmitted={load}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        highlight ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
      )}
    >
      <p className="text-xs text-slate-muted">{label}</p>
      <p className="text-2xl font-bold text-brand">{value}</p>
    </div>
  );
}
