"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { SupportInquiryCompleteModal } from "@/components/support/SupportInquiryCompleteModal";
import { formatDate } from "@/lib/utils";

type Detail = {
  id: string;
  displayId: string;
  segmentLabel: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  message: string | null;
  source: string;
  status: string;
  dueAt: string | null;
  completionNotes: string | null;
  completionOutcome: string | null;
  completedAt: string | null;
  messages: { role: string; content: string; createdAt: string }[];
};

export function SupportInquiryTaskClient({ inquiryId }: { inquiryId: string }) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void fetch(`/api/my/support-inquiries/${inquiryId}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) {
          setError(j.error ?? "Not found");
          setDetail(null);
        } else {
          setDetail(j.data);
          setError(null);
        }
      })
      .finally(() => setLoading(false));
  }, [inquiryId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-slate-muted">Loading…</p>;
  }

  if (error || !detail) {
    return (
      <div>
        <p className="text-red-600">{error ?? "Inquiry not found"}</p>
        <Link href="/rm/tasks" className="text-sm text-brand">
          Back to tasks
        </Link>
      </div>
    );
  }

  const open = detail.status === "pending" || detail.status === "in_progress";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/rm/tasks" className="text-sm text-brand hover:underline">
        ← Back to my tasks
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">{detail.displayId}</h1>
          <p className="text-sm text-slate-muted">{detail.segmentLabel}</p>
        </div>
        {open && (
          <Button onClick={() => setCompleteOpen(true)}>Complete</Button>
        )}
      </div>

      <Card className="p-4 space-y-2">
        <p className="text-lg font-medium">{detail.name}</p>
        <p className="text-sm text-slate-muted">{detail.phone}</p>
        {detail.email && <p className="text-sm text-slate-muted">{detail.email}</p>}
        {detail.city && <p className="text-sm text-slate-muted">{detail.city}</p>}
        {detail.dueAt && (
          <p className="text-xs text-slate-muted">Due {formatDate(detail.dueAt)}</p>
        )}
        {detail.message && (
          <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">{detail.message}</div>
        )}
      </Card>

      {detail.completionNotes && (
        <Card className="p-4">
          <h2 className="mb-2 font-semibold text-brand">Completion notes</h2>
          {detail.completionOutcome && (
            <p className="text-sm text-slate-muted">Outcome: {detail.completionOutcome}</p>
          )}
          <p className="mt-1 whitespace-pre-wrap text-sm">{detail.completionNotes}</p>
          {detail.completedAt && (
            <p className="mt-2 text-xs text-slate-muted">Completed {formatDate(detail.completedAt)}</p>
          )}
        </Card>
      )}

      {detail.messages.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-2 font-semibold text-brand">Chat transcript</h2>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {detail.messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-amber-50" : "bg-slate-50"}`}
              >
                <span className="font-medium capitalize">{m.role}: </span>
                {m.content}
              </div>
            ))}
          </div>
        </Card>
      )}

      <SupportInquiryCompleteModal
        inquiryId={detail.id}
        displayId={detail.displayId}
        name={detail.name}
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        onCompleted={load}
      />
    </div>
  );
}
