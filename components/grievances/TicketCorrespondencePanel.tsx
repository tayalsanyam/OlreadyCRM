"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  CORRESPONDENCE_CHANNEL_LABEL,
  CORRESPONDENCE_KIND_LABEL,
  type CorrespondenceChannel,
  type CorrespondenceKind,
} from "@/lib/ticket-correspondence";
import { formatDate } from "@/lib/utils";

export type TicketCommentRow = {
  id: string;
  body: string;
  isInternal: boolean;
  isAiGenerated: boolean;
  aiMode: string | null;
  authorName: string | null;
  createdAt: string;
  correspondenceKind: CorrespondenceKind | null;
  channel: CorrespondenceChannel | null;
};

type Props = {
  ticketId: string;
  partyLabel?: string;
  comments: TicketCommentRow[];
  onLogged?: () => void;
};

const CHANNEL_OPTIONS = Object.entries(CORRESPONDENCE_CHANNEL_LABEL).map(([value, label]) => ({
  value,
  label,
}));

function commentBadge(c: TicketCommentRow) {
  if (c.correspondenceKind) {
    const variant =
      c.correspondenceKind === "care_reply"
        ? "success"
        : c.correspondenceKind === "party_reply"
          ? "default"
          : "muted";
    return (
      <Badge variant={variant}>
        {CORRESPONDENCE_KIND_LABEL[c.correspondenceKind]}
        {c.channel ? ` · ${CORRESPONDENCE_CHANNEL_LABEL[c.channel]}` : ""}
      </Badge>
    );
  }
  if (c.isAiGenerated) {
    return <Badge variant="muted">AI{c.aiMode ? ` · ${c.aiMode}` : ""}</Badge>;
  }
  if (c.body.startsWith("Email sent") || c.body.startsWith("Email approved")) {
    return <Badge variant="success">Email sent</Badge>;
  }
  return <Badge variant="muted">System</Badge>;
}

export function TicketCorrespondencePanel({
  ticketId,
  partyLabel = "Customer / MUA",
  comments,
  onLogged,
}: Props) {
  const { toast } = useToast();
  const [kind, setKind] = useState<CorrespondenceKind>("care_reply");
  const [channel, setChannel] = useState<CorrespondenceChannel>("whatsapp");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!body.trim()) {
      toast("Enter what was said or written", "error");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/crm/tickets/${ticketId}/correspondence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, channel, body: body.trim() }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast(json.error ?? "Failed to log correspondence", "error");
      return;
    }
    toast("Logged on ticket timeline");
    setBody("");
    onLogged?.();
  };

  return (
    <Card className="p-4">
      <h2 className="font-semibold text-brand">Correspondence log</h2>
      <p className="mt-1 text-xs text-slate-muted">
        Log calls, WhatsApp, and other back-and-forth. Sent emails appear here automatically.
      </p>

      <div className="mt-4 space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={kind === "care_reply" ? "primary" : "secondary"}
            onClick={() => setKind("care_reply")}
          >
            Log our response
          </Button>
          <Button
            size="sm"
            variant={kind === "party_reply" ? "primary" : "secondary"}
            onClick={() => setKind("party_reply")}
          >
            Log {partyLabel} response
          </Button>
        </div>

        <Select
          label="Channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as CorrespondenceChannel)}
          options={CHANNEL_OPTIONS}
        />

        <div>
          <label className="mb-1 block text-sm font-medium">Message / summary</label>
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={4}
            placeholder={
              kind === "party_reply"
                ? "What they said or wrote…"
                : "What we said or wrote…"
            }
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <Button onClick={submit} disabled={loading}>
          {loading ? "Saving…" : "Add to timeline"}
        </Button>
      </div>

      <div className="mt-4 max-h-96 space-y-3 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="text-sm text-slate-muted">No correspondence logged yet</p>
        ) : (
          [...comments].reverse().map((c) => (
            <div
              key={c.id}
              className={`rounded-lg border p-3 text-sm ${
                c.correspondenceKind === "care_reply"
                  ? "border-emerald-100 bg-emerald-50/40"
                  : c.correspondenceKind === "party_reply"
                    ? "border-sky-100 bg-sky-50/40"
                    : "border-slate-100 bg-slate-50"
              }`}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-muted">
                {commentBadge(c)}
                <span>{c.authorName ?? (c.isAiGenerated ? "AI Advisor" : "System")}</span>
                <span>{formatDate(c.createdAt)}</span>
              </div>
              <pre className="whitespace-pre-wrap font-sans">{c.body}</pre>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
