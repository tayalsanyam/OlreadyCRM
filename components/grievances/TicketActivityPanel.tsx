"use client";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { TicketCommentRow } from "@/components/grievances/TicketCorrespondencePanel";
import { formatDate } from "@/lib/utils";

type TicketUpdate = {
  id: string;
  updateText: string;
  categories: string[];
  source: string;
  authorName: string | null;
  createdAt: string;
};

type Props = {
  comments: TicketCommentRow[];
  updates?: TicketUpdate[];
};

export function TicketActivityPanel({ comments, updates = [] }: Props) {
  const activityComments = comments.filter((c) => !c.correspondenceKind);

  return (
    <Card className="p-4">
      <h2 className="font-semibold text-brand">Activity log</h2>
      <p className="mt-1 text-xs text-slate-muted">
        Status changes, tasks, AI output, and internal notes — not customer communications.
      </p>

      {updates.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium uppercase text-slate-muted">Follow-up updates</p>
          {updates.map((u) => (
            <div key={u.id} className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 text-sm">
              <div className="mb-1 flex flex-wrap gap-2 text-xs text-slate-muted">
                <Badge variant="muted">{u.source === "public_form" ? "Public" : "Internal"}</Badge>
                {u.authorName && <span>{u.authorName}</span>}
                <span>{formatDate(u.createdAt)}</span>
              </div>
              <pre className="whitespace-pre-wrap font-sans">{u.updateText}</pre>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
        {activityComments.length === 0 ? (
          <p className="text-sm text-slate-muted">No activity yet</p>
        ) : (
          activityComments.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
              <div className="mb-1 flex flex-wrap gap-2 text-xs text-slate-muted">
                {c.isAiGenerated && <Badge variant="muted">AI{c.aiMode ? ` · ${c.aiMode}` : ""}</Badge>}
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
