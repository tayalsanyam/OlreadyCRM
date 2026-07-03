"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ticketStatusLabel } from "@/lib/ticket-status";
import { formatDate } from "@/lib/utils";
import type { SupportTicket } from "@/lib/types";

type TicketUpdate = {
  id: string;
  updateText: string;
  authorName: string | null;
  createdAt: string;
};

export function FeedbackTicketClient({ ticketId }: { ticketId: string }) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [updates, setUpdates] = useState<TicketUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch(`/api/crm/tickets/${ticketId}`)
      .then((r) => r.json())
      .then((j: { data?: { ticket: SupportTicket; updates: TicketUpdate[] }; error?: string }) => {
        if (!j.data) {
          setError(j.error ?? "Could not load ticket");
          setLoading(false);
          return;
        }
        setTicket(j.data.ticket);
        setUpdates(j.data.updates ?? []);
        setLoading(false);
      });
  }, [ticketId]);

  if (loading) {
    return <p className="text-sm text-slate-muted">Loading ticket…</p>;
  }

  if (error || !ticket) {
    return (
      <div className="space-y-4">
        <Link href="/feedback/grievances" className="text-sm text-slate-muted hover:text-accent">
          ← Back to my tickets
        </Link>
        <p className="text-sm text-danger">{error ?? "Ticket not found"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/feedback/grievances" className="text-sm text-slate-muted hover:text-accent">
        ← Back to my tickets
      </Link>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand">{ticket.ticketNumber}</h1>
            <p className="text-sm text-slate-muted">{ticket.muaName ?? "No MUA linked"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{ticketStatusLabel(ticket.status)}</Badge>
            <Badge variant="muted">{ticket.urgency}</Badge>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-muted">
            Category
          </p>
          <p className="text-sm">{ticket.category}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-muted">
            Complaint
          </p>
          <p className="whitespace-pre-wrap text-sm">{ticket.complaintText}</p>
        </div>
        <p className="text-xs text-slate-muted">
          Created {formatDate(ticket.createdAt)}
          {ticket.closedAt ? ` · Closed ${formatDate(ticket.closedAt)}` : ""}
        </p>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-brand">Care team updates</h2>
        {updates.length === 0 ? (
          <p className="text-sm text-slate-muted">No public updates yet.</p>
        ) : (
          <ul className="space-y-2">
            {updates.map((u) => (
              <li key={u.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
                <p className="whitespace-pre-wrap">{u.updateText}</p>
                <p className="mt-2 text-xs text-slate-muted">
                  {u.authorName ?? "Care"} · {formatDate(u.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-slate-muted">
        Read-only view. Care agents handle investigation and resolution in the grievance centre.
      </p>
    </div>
  );
}
