"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { FeedbackRaiseCareTicketButton } from "@/components/grievances/FeedbackRaiseCareTicketButton";
import { formatDate } from "@/lib/utils";

type TicketRow = {
  id: string;
  ticketNumber: string;
  muaName: string | null;
  category: string;
  status: string;
  urgency: string;
  createdAt: string;
};

export default function FeedbackGrievancesPage() {
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/feedback/grievances")
      .then((r) => r.json())
      .then((j: { data: TicketRow[] }) => {
        setRows(j.data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">Care tickets I raised</h1>
          <p className="text-sm text-slate-muted">
            Grievances you raised (bride or MUA side) — care team works them; you can track status
            here.
          </p>
        </div>
        <Link href="/feedback/muas">
          <Button size="sm" variant="secondary">
            MUA database
          </Button>
        </Link>
        <FeedbackRaiseCareTicketButton
          context="mua"
          label="Raise ticket"
          variant="primary"
        />
      </div>

      {loading ? (
        <p className="text-sm text-slate-muted">Loading…</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Ticket</TH>
              <TH>MUA</TH>
              <TH>Category</TH>
              <TH>Urgency</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TR>
                <TD colSpan={7} className="py-8 text-center text-slate-muted">
                  No tickets yet — raise from a post-event lead, MUA profile, or the button above.
                </TD>
              </TR>
            ) : (
              rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">{r.ticketNumber}</TD>
                  <TD>{r.muaName ?? "—"}</TD>
                  <TD>{r.category}</TD>
                  <TD>
                    <Badge variant="muted">{r.urgency}</Badge>
                  </TD>
                  <TD>
                    <Badge>{r.status}</Badge>
                  </TD>
                  <TD className="text-xs">{formatDate(r.createdAt)}</TD>
                  <TD>
                    <Link href={`/feedback/grievances/${r.id}`}>
                      <Button size="sm" variant="secondary">
                        View
                      </Button>
                    </Link>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      )}
    </div>
  );
}
