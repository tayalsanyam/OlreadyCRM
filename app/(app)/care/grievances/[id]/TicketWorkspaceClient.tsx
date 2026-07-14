"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { CallyzerCallsPanel } from "@/components/grievances/CallyzerCallsPanel";
import { LedgerInputPanel } from "@/components/grievances/LedgerInputPanel";
import { CreateCareTaskSlideOver } from "@/components/grievances/CreateCareTaskSlideOver";
import { GrievanceTaskCompleteModal } from "@/components/grievances/GrievanceTaskCompleteModal";
import { TicketCrmContextCard } from "@/components/grievances/TicketCrmContextCard";
import { TicketEmailPanel } from "@/components/grievances/TicketEmailPanel";
import { LeadReversalPanel } from "@/components/grievances/LeadReversalPanel";
import { TicketAttachmentsPanel } from "@/components/grievances/TicketAttachmentsPanel";
import { TicketInvestigationTabs } from "@/components/grievances/TicketInvestigationTabs";
import { TicketCommunicationsPanel } from "@/components/grievances/TicketCommunicationsPanel";
import { TicketActivityPanel } from "@/components/grievances/TicketActivityPanel";
import { AddTicketUpdateSlideOver } from "@/components/grievances/AddTicketUpdateSlideOver";
import type { TicketCommentRow } from "@/components/grievances/TicketCorrespondencePanel";
import { TicketWhatsAppPanel } from "@/components/grievances/TicketWhatsAppPanel";
import { AdminInterjectionBar } from "@/components/grievances/AdminInterjectionBar";
import { EscalateTicketModal } from "@/components/grievances/EscalateTicketModal";
import { TicketStatusChangePanel } from "@/components/grievances/TicketStatusChangePanel";
import { ticketStatusLabel } from "@/lib/ticket-status";
import { allCategoriesFromTicket, formatTicketCategories } from "@/lib/ticket-categories";
import { raisedByTypeLabel, ticketSubmitterLabel } from "@/lib/ticket-display";
import {
  isBrideComplaintAgainstMua,
  ticketComplainantLabel,
  ticketComplaintTargetLabel,
} from "@/lib/ticket-party-display";
import type { SupportTicket } from "@/lib/types";
import type { TicketContext } from "@/lib/ticket-context";
import { formatDate, cn } from "@/lib/utils";

type TicketUpdate = {
  id: string;
  updateText: string;
  categories: string[];
  source: string;
  authorName: string | null;
  createdAt: string;
};

type Comment = TicketCommentRow;

type CareTask = {
  id: string;
  displayId: string;
  taskType: string;
  status: string;
  priority: string;
  title: string;
  assigneeName: string | null;
  dueAt: string | null;
  completedAt?: string | null;
};

function isOpenCareTask(status: string): boolean {
  return status === "pending" || status === "in_progress";
}

function careTaskStatusLabel(status: string): string {
  if (status === "cancelled") return "cancelled (superseded)";
  return status;
}

type MuaHit = { id: string; displayId?: string | null; name: string; phone: string | null; city: string | null };

type EmailDraft = { subject: string; body: string };

export function TicketWorkspaceClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params.id);
  const { toast } = useToast();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [context, setContext] = useState<TicketContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMode, setAiMode] = useState("issue_analysis");
  const [taskOpen, setTaskOpen] = useState(false);
  const [completeTask, setCompleteTask] = useState<CareTask | null>(null);
  const [muaSearch, setMuaSearch] = useState("");
  const [muaHits, setMuaHits] = useState<MuaHit[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [requiresLedger, setRequiresLedger] = useState(false);
  const [hasLedger, setHasLedger] = useState(false);
  const [statusPanelOpen, setStatusPanelOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [updates, setUpdates] = useState<TicketUpdate[]>([]);
  const [updateOpen, setUpdateOpen] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((r) => r.json())
      .then((json) => {
        const role = json.data?.role as string | undefined;
        setIsAdmin(role === "admin" || role === "owner");
      });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    void fetch(`/api/crm/tickets/${id}`)
      .then(async (r) => {
        const text = await r.text();
        if (!text) {
          throw new Error(r.ok ? "Empty response from server" : `Request failed (${r.status})`);
        }
        return JSON.parse(text) as {
          data?: {
            ticket: SupportTicket;
            comments?: Comment[];
            tasks?: CareTask[];
            context?: TicketContext | null;
            requiresLedger?: boolean;
            hasLedger?: boolean;
            updates?: TicketUpdate[];
          };
          error?: string;
        };
      })
      .then((json) => {
        if (json.data) {
          setTicket(json.data.ticket);
          setComments(json.data.comments ?? []);
          setTasks(json.data.tasks ?? []);
          setContext(json.data.context ?? null);
          setRequiresLedger(Boolean(json.data.requiresLedger));
          setHasLedger(Boolean(json.data.hasLedger));
          setUpdates(json.data.updates ?? []);
        } else if (json.error) {
          toast(json.error, "error");
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        setLoading(false);
        toast(err instanceof Error ? err.message : "Failed to load ticket", "error");
      });
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("addUpdate") === "1") {
      setUpdateOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (muaSearch.trim().length < 2) {
      setMuaHits([]);
      return;
    }
    const t = setTimeout(() => {
      void fetch(`/api/crm/muas?q=${encodeURIComponent(muaSearch.trim())}`)
        .then((r) => r.json())
        .then((json) => setMuaHits(json.data ?? []));
    }, 250);
    return () => clearTimeout(t);
  }, [muaSearch]);

  const linkMua = async (muaId: string) => {
    const res = await fetch(`/api/crm/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muaId, reason: "MUA linked manually" }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast(json.error ?? "Link failed", "error");
      return;
    }
    toast("MUA linked");
    setMuaSearch("");
    setMuaHits([]);
    load();
  };

  const escalate = async (payload: {
    toLevel: number;
    reason: string;
    loopInAdminId?: string;
  }) => {
    const res = await fetch(`/api/crm/tickets/${id}/escalate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      toast(json.error ?? "Escalation failed", "error");
      return false;
    }
    toast(`Escalated to L${payload.toLevel}${payload.loopInAdminId ? " — admin looped in" : ""}`);
    load();
    return true;
  };

  const runAiEmailSuggest = async () => {
    setAiLoading(true);
    const res = await fetch(`/api/crm/tickets/${id}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "response_draft" }),
    });
    const json = await res.json();
    setAiLoading(false);
    if (!res.ok) {
      toast(json.error ?? "AI suggest failed", "error");
      return;
    }
    if (json.data?.emailDraft) {
      setEmailDraft(json.data.emailDraft);
      toast("AI draft applied to email panel — review before sending");
    } else {
      toast("AI analysis added to timeline — copy draft from Timeline if needed");
    }
    load();
  };

  const runAi = async () => {
    setAiLoading(true);
    const res = await fetch(`/api/crm/tickets/${id}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: aiMode }),
    });
    const json = await res.json();
    setAiLoading(false);
    if (!res.ok) {
      toast(json.error ?? "AI failed", "error");
      return;
    }
    const docNote =
      json.data?.docTitles?.length > 0
        ? ` — ${json.data.docTitles.length} policy doc${json.data.docTitles.length === 1 ? "" : "s"} used`
        : "";
    toast(`AI analysis added to timeline${docNote}`);
    load();
  };

  if (loading) {
    return <p className="text-slate-muted">Loading ticket…</p>;
  }

  if (!ticket) {
    return (
      <div>
        <p>Ticket not found.</p>
        <Link href="/care/grievances" className="text-brand">
          Back to inbox
        </Link>
      </div>
    );
  }

  const partyRow = {
    raisedByType: ticket.raisedByType,
    muaId: ticket.muaId ?? null,
    muaName: ticket.muaName ?? null,
    brideName: ticket.brideName ?? null,
    raisedByName: ticket.raisedByName ?? null,
    leadDisplayId: ticket.leadDisplayId ?? null,
  };
  const brideVsMua = isBrideComplaintAgainstMua(partyRow);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/care/grievances" className="text-sm text-brand hover:underline">
            ← Inbox
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-brand">{ticket.ticketNumber}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={ticket.raisedByType === "bride" ? "hot" : "muted"}>
              {raisedByTypeLabel(ticket.raisedByType)}
            </Badge>
            {brideVsMua && (
              <Badge variant="critical">Complaint against MUA</Badge>
            )}
            <p className="text-sm text-slate-muted">
              {formatTicketCategories(allCategoriesFromTicket(ticket.category, ticket.tags ?? []))}
            </p>
          </div>
          <p className="text-sm text-slate-muted">
            {brideVsMua ? (
              <>
                Complainant:{" "}
                {ticket.leadId ? (
                  <Link href={`/rm/leads/${ticket.leadId}`} className="text-accent hover:underline">
                    {ticketComplainantLabel(partyRow)}
                  </Link>
                ) : (
                  ticketComplainantLabel(partyRow)
                )}
                {" · "}
                Tagged MUA:{" "}
                {ticket.muaId ? (
                  <Link href={`/care/muas/${ticket.muaId}`} className="text-accent hover:underline">
                    {ticketComplaintTargetLabel(partyRow)}
                  </Link>
                ) : (
                  "—"
                )}
              </>
            ) : ticket.raisedByType === "bride" ? (
              ticket.leadId ? (
                <Link href={`/rm/leads/${ticket.leadId}`} className="text-accent hover:underline">
                  {ticketSubmitterLabel({
                    raisedByType: ticket.raisedByType,
                    raisedByName: ticket.raisedByName,
                    muaName: ticket.muaName ?? null,
                    brideName: ticket.brideName ?? null,
                    leadDisplayId: ticket.leadDisplayId ?? null,
                  })}
                </Link>
              ) : (
                ticket.raisedByName ?? "Bride (unlinked lead)"
              )
            ) : ticket.muaId ? (
              <Link href={`/care/muas/${ticket.muaId}`} className="text-accent hover:underline">
                {ticket.muaName ?? "View MUA"}
              </Link>
            ) : (
              ticket.raisedByName ?? "MUA (unlinked)"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={ticket.urgency === "high" ? "critical" : "muted"}>
            {ticket.urgency}
          </Badge>
          {ticket.escalationLevel > 1 && (
            <span title={ticket.escalationReason ?? undefined}>
              <Badge variant="hot">L{ticket.escalationLevel}</Badge>
            </span>
          )}
          {ticket.slaBreached && <Badge variant="critical">SLA breached</Badge>}
          <Badge variant="muted">{ticketStatusLabel(ticket.status, ticket.raisedByType)}</Badge>
          {ticket.assignedAdminName && (
            <Badge variant="hot">Admin: {ticket.assignedAdminName}</Badge>
          )}
          <Button size="sm" variant="secondary" onClick={() => setUpdateOpen(true)}>
            Add update
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEscalateOpen(true)}>
            Escalate
          </Button>
          <Button size="sm" onClick={() => setStatusPanelOpen(true)}>
            Update status
          </Button>
        </div>
      </div>

      <EscalateTicketModal
        open={escalateOpen}
        onClose={() => setEscalateOpen(false)}
        currentLevel={ticket.escalationLevel}
        onConfirm={escalate}
      />

      <TicketStatusChangePanel
        open={statusPanelOpen}
        onClose={() => setStatusPanelOpen(false)}
        ticketId={id}
        currentStatus={ticket.status}
        ticketNumber={ticket.ticketNumber}
        assignedAdminId={ticket.assignedAdminId}
        assignedAdminName={ticket.assignedAdminName}
        muaName={context?.mua?.name ?? ticket.muaName}
        phone={context?.mua?.phone ?? ticket.raisedByPhone}
        whatsapp={context?.mua?.whatsapp ?? context?.mua?.phone ?? ticket.raisedByPhone}
        city={context?.mua?.city ?? undefined}
        raisedByType={ticket.raisedByType}
        onDone={load}
      />

      {isAdmin && (
        <AdminInterjectionBar
          ticketId={id}
          assignedAdminName={ticket.assignedAdminName}
          onUpdated={load}
        />
      )}

      {requiresLedger && !hasLedger && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This ticket category requires a lead usage ledger. Upload or paste ledger data below before
          closing the ticket.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h2 className="font-semibold text-brand">Complaint</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{ticket.complaintText}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-muted">
              {ticket.raisedByPhone && <span>Phone: {ticket.raisedByPhone}</span>}
              {ticket.raisedByEmail && <span>Email: {ticket.raisedByEmail}</span>}
              <span>Created: {formatDate(ticket.createdAt)}</span>
              {ticket.slaDueAt && <span>SLA: {formatDate(ticket.slaDueAt)}</span>}
            </div>
          </Card>

          {!ticket.muaId && (
            <Card className="p-4">
              <h2 className="font-semibold text-brand">Link MUA</h2>
              {ticket.raisedByType === "bride" && (
                <p className="mt-1 text-xs text-slate-muted">
                  Optional — link the artist this bride complaint is about, if known.
                </p>
              )}
              <Input
                placeholder="Search MUA by name or phone…"
                value={muaSearch}
                onChange={(e) => setMuaSearch(e.target.value)}
                className="mt-2"
              />
              {muaHits.length > 0 && (
                <div className="mt-2 max-h-52 overflow-y-auto overscroll-y-contain rounded-lg border border-slate-200 bg-white">
                  {muaHits.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                      onClick={() => linkMua(m.id)}
                    >
                      <span className="font-medium text-brand">{m.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-muted">
                        {m.displayId ?? "—"} · {m.phone ?? "no phone"} · {m.city ?? "—"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}

          <TicketInvestigationTabs
            ticketId={id}
            muaId={ticket.muaId}
            leadId={ticket.leadId}
            raisedByType={ticket.raisedByType}
          />

          <TicketWhatsAppPanel
            ticketId={id}
            ticketNumber={ticket.ticketNumber}
            raisedByType={ticket.raisedByType}
            muaName={context?.mua?.name ?? ticket.muaName ?? null}
            muaPhone={context?.mua?.phone ?? null}
            muaWhatsapp={context?.mua?.whatsapp ?? context?.mua?.phone}
            brideName={context?.lead?.brideName ?? ticket.brideName ?? ticket.raisedByName}
            bridePhone={context?.lead?.phone ?? ticket.raisedByPhone}
            city={context?.mua?.city ?? undefined}
            onLogged={load}
          />

          <LedgerInputPanel ticketId={id} />
          <TicketAttachmentsPanel ticketId={id} />
          <CallyzerCallsPanel ticketId={id} />

          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-brand">AI Advisor</h2>
              <div className="flex gap-2">
                <Select
                  value={aiMode}
                  onChange={(e) => setAiMode(e.target.value)}
                  options={[
                    { value: "issue_analysis", label: "Issue analysis" },
                    { value: "thread_absorption", label: "Thread absorption" },
                    { value: "final_audit", label: "Final audit" },
                    { value: "response_draft", label: "Response draft" },
                    { value: "policy_helper", label: "Policy helper" },
                  ]}
                />
                <Button size="sm" onClick={runAi} disabled={aiLoading}>
                  {aiLoading ? "Running…" : "Run AI"}
                </Button>
                <Button size="sm" variant="secondary" onClick={runAiEmailSuggest} disabled={aiLoading}>
                  AI suggest email
                </Button>
              </div>
            </div>
          </Card>

          <TicketCommunicationsPanel
            ticketId={id}
            ticketNumber={ticket.ticketNumber}
            partyLabel={ticket.raisedByName ?? "Customer / MUA"}
            onLogged={load}
          />

          <TicketActivityPanel comments={comments} updates={updates} />
        </div>

        <div className="space-y-4">
          <TicketCrmContextCard
            context={context}
            muaId={ticket.muaId}
            muaProfileHref={ticket.muaId ? `/care/muas/${ticket.muaId}` : undefined}
          />

          <LeadReversalPanel ticketId={id} category={ticket.category} isAdmin={isAdmin} />

          <TicketEmailPanel
            ticketId={id}
            ticketNumber={ticket.ticketNumber}
            ticketCategory={ticket.category}
            raisedByType={ticket.raisedByType}
            ticketStatus={ticket.status}
            complaintText={ticket.complaintText}
            muaName={context?.mua?.name ?? ticket.muaName}
            brideName={context?.lead?.brideName ?? undefined}
            raisedByName={ticket.raisedByName}
            defaultToEmail={ticket.raisedByEmail}
            isAdmin={isAdmin}
            suggestedDraft={emailDraft}
            onDraftApplied={() => setEmailDraft(null)}
            onWorkflowChange={load}
          />

          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-brand">Care tasks</h2>
              <Button size="sm" onClick={() => setTaskOpen(true)}>
                Assign
              </Button>
            </div>
            <ul className="space-y-2 text-sm">
              {tasks.length === 0 ? (
                <li className="text-slate-muted">No tasks</li>
              ) : (
                (() => {
                  const openTasks = tasks.filter((t) => isOpenCareTask(t.status));
                  const closedTasks = tasks.filter((t) => !isOpenCareTask(t.status));
                  const renderTask = (t: CareTask) => (
                    <li
                      key={t.id}
                      className={cn(
                        "rounded border p-2",
                        isOpenCareTask(t.status)
                          ? "border-slate-200 bg-white"
                          : "border-slate-100 bg-slate-50/80"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-medium">{t.displayId}</span> — {t.title}
                          <div className="text-xs text-slate-muted">
                            {t.taskType.replace(/_/g, " ")} · {careTaskStatusLabel(t.status)} ·{" "}
                            {t.assigneeName ?? "Unassigned"}
                          </div>
                        </div>
                        {isOpenCareTask(t.status) && (
                          <Button size="sm" variant="secondary" onClick={() => setCompleteTask(t)}>
                            Done
                          </Button>
                        )}
                      </div>
                    </li>
                  );

                  return (
                    <>
                      {openTasks.length > 0 && (
                        <>
                          <li className="text-xs font-medium uppercase tracking-wide text-slate-muted">
                            Open ({openTasks.length})
                          </li>
                          {openTasks.map(renderTask)}
                        </>
                      )}
                      {closedTasks.length > 0 && (
                        <>
                          <li className="pt-2 text-xs font-medium uppercase tracking-wide text-slate-muted">
                            Completed ({closedTasks.length})
                          </li>
                          {closedTasks.map(renderTask)}
                        </>
                      )}
                    </>
                  );
                })()
              )}
            </ul>
          </Card>
        </div>
      </div>

      <CreateCareTaskSlideOver
        ticketId={id}
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        onCreated={load}
      />

      {completeTask && (
        <GrievanceTaskCompleteModal
          taskId={completeTask.id}
          taskType={completeTask.taskType}
          title={completeTask.title}
          ticketNumber={ticket.ticketNumber}
          open={Boolean(completeTask)}
          onClose={() => setCompleteTask(null)}
          onCompleted={load}
        />
      )}

      <AddTicketUpdateSlideOver
        ticketId={id}
        ticketNumber={ticket.ticketNumber}
        open={updateOpen}
        onClose={() => setUpdateOpen(false)}
        onAdded={load}
      />
    </div>
  );
}
