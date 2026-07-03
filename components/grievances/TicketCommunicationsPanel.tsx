"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  CORRESPONDENCE_CHANNEL_LABEL,
  type CorrespondenceChannel,
  type CorrespondenceKind,
} from "@/lib/ticket-correspondence";
import type { TicketCommunicationRow } from "@/lib/ticket-communications";
import { formatDate } from "@/lib/utils";

type Props = {
  ticketId: string;
  ticketNumber: string;
  partyLabel?: string;
  onLogged?: () => void;
};

const CHANNEL_OPTIONS = Object.entries(CORRESPONDENCE_CHANNEL_LABEL).map(([value, label]) => ({
  value,
  label,
}));

export function TicketCommunicationsPanel({
  ticketId,
  ticketNumber,
  partyLabel = "Customer / MUA",
  onLogged,
}: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<TicketCommunicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<CorrespondenceKind>("care_reply");
  const [channel, setChannel] = useState<CorrespondenceChannel>("whatsapp");
  const [body, setBody] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    void fetch(`/api/crm/tickets/${ticketId}/communications`)
      .then((r) => r.json())
      .then((json) => {
        setRows(json.data?.communications ?? []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        toast("Could not load communications", "error");
      });
  }, [ticketId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!body.trim()) {
      toast("Enter what was said or written", "error");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/crm/tickets/${ticketId}/correspondence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, channel, body: body.trim() }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast(json.error ?? "Failed to log", "error");
      return;
    }
    toast("Logged");
    setBody("");
    load();
    onLogged?.();
  };

  const downloadCsv = () => {
    window.open(`/api/crm/tickets/${ticketId}/communications?format=csv`, "_blank");
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-brand">Communications</h2>
          <p className="mt-1 text-xs text-slate-muted">
            Outbound and inbound messages only — separate from internal activity log.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={downloadCsv} disabled={!rows.length}>
          Download CSV
        </Button>
      </div>

      <div className="mt-4 space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={kind === "care_reply" ? "primary" : "secondary"}
            onClick={() => setKind("care_reply")}
          >
            Log our message
          </Button>
          <Button
            size="sm"
            variant={kind === "party_reply" ? "primary" : "secondary"}
            onClick={() => setKind("party_reply")}
          >
            Log {partyLabel} reply
          </Button>
        </div>
        <Select
          label="Channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as CorrespondenceChannel)}
          options={CHANNEL_OPTIONS}
        />
        <textarea
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          rows={3}
          placeholder="Message summary…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Add to communications"}
        </Button>
      </div>

      <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-slate-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-muted">No communications logged yet</p>
        ) : (
          rows.map((r) => (
            <div
              key={`${r.source}-${r.id}`}
              className={`rounded-lg border p-3 text-sm ${
                r.direction === "outbound"
                  ? "border-emerald-100 bg-emerald-50/40"
                  : "border-sky-100 bg-sky-50/40"
              }`}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-muted">
                <Badge variant={r.direction === "outbound" ? "success" : "default"}>
                  {r.direction === "outbound" ? "Outbound" : "Inbound"}
                </Badge>
                <Badge variant="muted">{r.channel}</Badge>
                {r.status && (
                  <Badge variant={r.status === "sent" ? "success" : "muted"}>{r.status}</Badge>
                )}
                {r.authorName && <span>{r.authorName}</span>}
                <span>{formatDate(r.createdAt)}</span>
              </div>
              {r.subject && <p className="font-medium">{r.subject}</p>}
              <pre className="mt-1 whitespace-pre-wrap font-sans">{r.body}</pre>
            </div>
          ))
        )}
      </div>
      <p className="mt-2 text-xs text-slate-muted">
        Export: {ticketNumber}-communications.csv
      </p>
    </Card>
  );
}
