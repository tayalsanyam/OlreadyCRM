"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { formatDate } from "@/lib/utils";

type TicketRow = {
  id: string;
  ticketNumber: string;
  category: string;
  status: string;
  urgency: string;
  createdAt: string;
};

export function MuaCareTicketsPanel({
  muaId,
  readOnly = false,
  ticketHrefPrefix = "/care/grievances",
}: {
  muaId: string;
  readOnly?: boolean;
  ticketHrefPrefix?: string;
}) {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = readOnly
      ? `/api/muas/${muaId}/care-tickets`
      : `/api/crm/tickets?muaId=${muaId}`;
    void fetch(url)
      .then((r) => r.json())
      .then((json) => {
        setTickets(json.data ?? []);
        setLoading(false);
      });
  }, [muaId, readOnly]);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-brand">Care tickets</h2>
        {!readOnly && (
          <Link
            href={`/care/grievances?mua=${muaId}`}
            className="text-xs text-accent hover:underline"
          >
            Open Grievance Centre
          </Link>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-slate-muted">Loading tickets…</p>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-slate-muted">No care tickets for this MUA</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Ticket</TH>
              <TH>Category</TH>
              <TH>Status</TH>
              <TH>Urgency</TH>
              <TH>Opened</TH>
            </TR>
          </THead>
          <TBody>
            {tickets.map((t) => (
              <TR key={t.id}>
                <TD>
                  {readOnly ? (
                    <span className="font-medium">{t.ticketNumber}</span>
                  ) : (
                    <Link
                      href={`${ticketHrefPrefix}/${t.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {t.ticketNumber}
                    </Link>
                  )}
                </TD>
                <TD className="capitalize">{t.category.replace(/_/g, " ")}</TD>
                <TD>{t.status.replace(/_/g, " ")}</TD>
                <TD>
                  <Badge variant={t.urgency === "high" ? "critical" : "muted"}>{t.urgency}</Badge>
                </TD>
                <TD>{formatDate(t.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
