"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { StaffPicker } from "@/components/grievances/StaffPicker";
import { SupportInquiryCompleteModal } from "@/components/support/SupportInquiryCompleteModal";
import { formatDate } from "@/lib/utils";

type InquiryRow = {
  id: string;
  displayId: string;
  sessionId: string | null;
  visitorKind: string;
  segment: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  message: string | null;
  source: string;
  status: string;
  assigneeName: string | null;
  dueAt: string | null;
  completionNotes: string | null;
  completedAt: string | null;
  completedByName: string | null;
  createdAt: string;
};

type SessionRow = {
  id: string;
  name: string;
  phone: string;
  visitorKind: string;
  segment: string;
  segmentLabel: string;
  inquiryId: string | null;
  inquiryDisplayId: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
};

type InquiryDetail = InquiryRow & {
  segmentLabel: string;
  assignedTo: string | null;
  assignedByName: string | null;
  parentInquiryId: string | null;
  parentDisplayId: string | null;
  completionOutcome: string | null;
  messages: { role: string; content: string; createdAt: string }[];
  followUps: {
    id: string;
    displayId: string;
    status: string;
    assigneeName: string | null;
    dueAt: string | null;
    createdAt: string;
  }[];
};

export function AdminSupportInquiriesClient({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"inquiries" | "sessions">("inquiries");
  const [scope, setScope] = useState<"pending" | "all">("pending");
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InquiryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [assignDue, setAssignDue] = useState("");
  const [followUpTo, setFollowUpTo] = useState("");
  const [followUpDue, setFollowUpDue] = useState("");
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    void fetch(`/api/admin/support/inquiries?scope=${scope}`)
      .then((r) => r.json())
      .then((j) => {
        setInquiries(j.data?.inquiries ?? []);
        setSessions(j.data?.sessions ?? []);
      })
      .finally(() => setLoading(false));
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDetail = (id: string) => {
    setSelectedId(id);
    void fetch(`/api/admin/support/inquiries/${id}`)
      .then((r) => r.json())
      .then((j) => {
        const d = j.data ?? null;
        setDetail(d);
        if (d?.assignedTo) setAssignTo(d.assignedTo);
      });
  };

  const patchInquiry = async (body: Record<string, unknown>) => {
    if (!detail) return false;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/support/inquiries/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Update failed", "error");
        return false;
      }
      load();
      loadDetail(detail.id);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const submitAssign = async () => {
    const ok = await patchInquiry({
      action: "assign",
      assignedTo: assignTo || null,
      dueAt: assignDue || undefined,
    });
    if (ok) {
      toast(assignTo ? "Assigned" : "Unassigned");
      setAssignOpen(false);
    }
  };

  const submitFollowUp = async () => {
    const ok = await patchInquiry({
      action: "followUp",
      followUpAssignedTo: followUpTo || assignTo || null,
      followUpDueAt: followUpDue || undefined,
      followUpMessage: followUpMessage || undefined,
    });
    if (ok) {
      toast("Follow-up created");
      setFollowUpOpen(false);
      setFollowUpMessage("");
    }
  };

  const closeInquiry = async () => {
    const ok = await patchInquiry({ action: "close" });
    if (ok) toast("Closed");
  };

  const isOpen =
    detail?.status === "pending" || detail?.status === "in_progress";

  return (
    <div className={embedded ? "space-y-4" : "mx-auto max-w-6xl space-y-6"}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-brand">Support inquiries</h1>
          <p className="mt-1 text-sm text-slate-muted">
            Assign follow-ups to any team member — sales, RM, care, or ops.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("inquiries")}
          className={`rounded-md px-3 py-1.5 text-sm ${tab === "inquiries" ? "bg-brand text-white" : "text-slate-muted hover:bg-slate-100"}`}
        >
          Follow-up tasks
        </button>
        <button
          type="button"
          onClick={() => setTab("sessions")}
          className={`rounded-md px-3 py-1.5 text-sm ${tab === "sessions" ? "bg-brand text-white" : "text-slate-muted hover:bg-slate-100"}`}
        >
          All chat sessions
        </button>
        {tab === "inquiries" && (
          <>
            <button
              type="button"
              onClick={() => setScope("pending")}
              className={`rounded-md px-3 py-1.5 text-sm ${scope === "pending" ? "bg-slate-800 text-white" : "text-slate-muted hover:bg-slate-100"}`}
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`rounded-md px-3 py-1.5 text-sm ${scope === "all" ? "bg-slate-800 text-white" : "text-slate-muted hover:bg-slate-100"}`}
            >
              All
            </button>
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden p-0">
          {loading ? (
            <p className="p-4 text-sm text-slate-muted">Loading…</p>
          ) : tab === "inquiries" ? (
            <ul className="divide-y divide-slate-100">
              {inquiries.length === 0 && (
                <li className="p-4 text-sm text-slate-muted">No inquiries in this view.</li>
              )}
              {inquiries.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => loadDetail(row.id)}
                    className={`flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-slate-50 ${selectedId === row.id ? "bg-brand/5" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{row.displayId}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
                        {row.status}
                      </span>
                      {row.assigneeName && (
                        <span className="text-[10px] text-slate-muted">→ {row.assigneeName}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium">
                      {row.name} · {row.phone}
                    </p>
                    <p className="text-xs text-slate-muted">
                      {row.visitorKind === "mua" ? "MUA" : "Bride"} · {formatDate(row.createdAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sessions.length === 0 && (
                <li className="p-4 text-sm text-slate-muted">No chat sessions yet.</li>
              )}
              {sessions.map((row) => (
                <li key={row.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">
                    {row.name} · {row.phone}
                  </p>
                  <p className="text-xs text-slate-muted">{row.segmentLabel}</p>
                  <p className="mt-1 text-xs text-slate-muted">
                    {row.messageCount} messages · {formatDate(row.createdAt)}
                    {row.inquiryDisplayId && (
                      <span className="ml-2 font-mono text-brand">{row.inquiryDisplayId}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          {!detail ? (
            <p className="text-sm text-slate-muted">Select an inquiry to view details.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="font-mono text-sm font-semibold">{detail.displayId}</p>
                {detail.parentDisplayId && (
                  <p className="text-xs text-slate-muted">Follow-up from {detail.parentDisplayId}</p>
                )}
                <p className="text-lg font-medium">{detail.name}</p>
                <p className="text-sm text-slate-muted">{detail.phone}</p>
                {detail.email && <p className="text-sm text-slate-muted">{detail.email}</p>}
                {detail.city && <p className="text-sm text-slate-muted">{detail.city}</p>}
              </div>

              <p className="text-xs text-slate-muted">
                {detail.segmentLabel} · {detail.source.replace("_", " ")}
                {detail.assigneeName && ` · ${detail.assigneeName}`}
                {detail.assignedByName && ` (assigned by ${detail.assignedByName})`}
              </p>

              {detail.message && (
                <div className="rounded-lg bg-slate-50 p-3 text-sm">{detail.message}</div>
              )}

              {detail.messages.length > 0 && (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-100 p-2">
                  {detail.messages.map((m, i) => (
                    <div
                      key={`${m.role}-${i}`}
                      className={`rounded-lg px-2 py-1.5 text-xs ${m.role === "user" ? "bg-amber-50" : "bg-slate-50"}`}
                    >
                      <span className="font-medium capitalize">{m.role}: </span>
                      {m.content}
                    </div>
                  ))}
                </div>
              )}

              {detail.completionNotes && (
                <div className="rounded-lg border border-green-100 bg-green-50 p-3">
                  <p className="text-xs font-semibold uppercase text-green-800">Completion notes</p>
                  {detail.completionOutcome && (
                    <p className="mt-1 text-xs text-green-900">Outcome: {detail.completionOutcome}</p>
                  )}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-green-950">{detail.completionNotes}</p>
                  <p className="mt-1 text-xs text-green-800">
                    {detail.completedByName && `${detail.completedByName} · `}
                    {detail.completedAt && formatDate(detail.completedAt)}
                  </p>
                </div>
              )}

              {detail.followUps.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-muted">Follow-ups</p>
                  <ul className="mt-1 space-y-1">
                    {detail.followUps.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => loadDetail(f.id)}
                          className="text-sm text-brand hover:underline"
                        >
                          {f.displayId}
                        </button>
                        <span className="ml-2 text-xs text-slate-muted">
                          {f.status}
                          {f.assigneeName && ` · ${f.assigneeName}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)}>
                  {detail.assigneeName ? "Reassign" : "Assign"}
                </Button>
                {isOpen && (
                  <Button size="sm" onClick={() => setCompleteOpen(true)}>
                    Complete
                  </Button>
                )}
                {detail.status === "done" && (
                  <Button size="sm" variant="secondary" onClick={() => setFollowUpOpen(true)}>
                    Assign follow-up
                  </Button>
                )}
                {isOpen && (
                  <Button size="sm" variant="secondary" onClick={() => void closeInquiry()}>
                    Close
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign to team member">
        <div className="space-y-4 p-1">
          <p className="text-sm text-slate-muted">
            Any active employee — sales, RM, care, commission, feedback, uploader, etc.
          </p>
          <StaffPicker value={assignTo} onChange={setAssignTo} label="Assign to" />
          <Input
            label="Due date"
            type="datetime-local"
            value={assignDue}
            onChange={(e) => setAssignDue(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitAssign()} disabled={saving}>
              {saving ? "Saving…" : "Save assignment"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={followUpOpen} onClose={() => setFollowUpOpen(false)} title="Assign follow-up">
        <div className="space-y-4 p-1">
          <StaffPicker value={followUpTo} onChange={setFollowUpTo} label="Assign to" />
          <Input
            label="Due date"
            type="datetime-local"
            value={followUpDue}
            onChange={(e) => setFollowUpDue(e.target.value)}
          />
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            placeholder="Follow-up instructions (optional)"
            value={followUpMessage}
            onChange={(e) => setFollowUpMessage(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFollowUpOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitFollowUp()} disabled={saving}>
              {saving ? "Creating…" : "Create follow-up"}
            </Button>
          </div>
        </div>
      </Modal>

      {detail && (
        <SupportInquiryCompleteModal
          inquiryId={detail.id}
          displayId={detail.displayId}
          name={detail.name}
          open={completeOpen}
          onClose={() => setCompleteOpen(false)}
          onCompleted={() => {
            load();
            loadDetail(detail.id);
          }}
          apiPath={`/api/admin/support/inquiries/${detail.id}`}
        />
      )}
    </div>
  );
}
