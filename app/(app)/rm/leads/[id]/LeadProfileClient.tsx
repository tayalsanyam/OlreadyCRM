"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  UserPlus,
  ArrowRight,
  Send,
  RefreshCw,
  CheckCircle,
  Zap,
  ArrowRightLeft,
  Phone,
  MessageSquare,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import {
  truncateWhatsAppPreview,
  whatsAppMessagePreview,
  whatsAppTemplateLabel,
} from "@/lib/whatsapp/comms-display";
import { formatLastLeadContactSource } from "@/lib/lead-last-contact";
import { PushMuaSlideOver } from "@/components/leads/PushMuaSlideOver";
import { FeedbackModal } from "@/components/leads/FeedbackModal";
import { ExpiredFeedbackModal } from "@/components/leads/ExpiredFeedbackModal";
import { notifyLeadRemovedFromQueue } from "@/lib/queue-events";
import { downloadLeadLogCsv } from "@/lib/download-lead-log";
import { resolveFeedbackEventCity } from "@/lib/feedback-event-city";
import { BookingModal } from "@/components/leads/BookingModal";
import { LeadActivityPanel } from "@/components/leads/LeadActivityPanel";
import { StageTimeline } from "@/components/leads/StageTimeline";
import { StageUpdateModal } from "@/components/leads/StageUpdateModal";
import { EditMuaQuoteModal } from "@/components/leads/EditMuaQuoteModal";
import { CeremoniesOverview } from "@/components/leads/CeremoniesOverview";
import { LeadBookingsPanel } from "@/components/leads/LeadBookingsPanel";
import { BrideProfileEditPanel } from "@/components/leads/BrideProfileEditPanel";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import { FeedbackRaiseCareTicketButton } from "@/components/grievances/FeedbackRaiseCareTicketButton";
import { LeadMuaWhatsAppPanel } from "@/components/leads/LeadMuaWhatsAppPanel";
import { CommissionSplitView } from "@/components/leads/CommissionSplitView";
import { CommissionFollowUpPanel } from "@/components/leads/CommissionFollowUpPanel";
import { ShiftToCommissionModal } from "@/components/leads/ShiftToCommissionModal";
import { BudgetQuotePanel } from "@/components/leads/BudgetQuotePanel";
import { EventPricingPanel } from "@/components/leads/EventPricingPanel";
import { Input } from "@/components/ui/Input";
import { coerceStringArray, formatDate, formatLabelsList, cn } from "@/lib/utils";
import type {
  Booking,
  CommEntry,
  CommEntryType,
  LastLeadContact,
  LeadEvent,
  LeadFull,
  MuaPushEventPrice,
  MuaPushStage,
  MuaPushWithDetails,
} from "@/lib/types";
import { getLeadStatusLabel } from "@/lib/lead-status";
import { LEAD_EXIT_LABELS } from "@/lib/lead-exit";
import { leadTracksCommissionSync } from "@/lib/lead-tracks-commission";
import {
  INTAKE_MIN_PROFILES,
  isLeadRequirementsConfirmed,
  canPushMuaToLead,
  BRIDE_CONFIRMATION_PUSH_BLOCK_MESSAGE,
} from "@/lib/lead-intake-config";
import {
  BUDGET_TIER_LABELS,
  MUA_PUSH_STAGE_LABELS,
  MUA_PUSH_STATUS_LABELS,
  PLAN_TIER_LABELS,
  PUSH_OUTCOME_LABELS,
  URGENCY_LABELS,
} from "@/lib/types";

const STAGES = (Object.keys(MUA_PUSH_STAGE_LABELS) as MuaPushStage[]).map(
  (value) => ({
    value,
    label: MUA_PUSH_STAGE_LABELS[value],
  })
);

/** Synthetic stage values — open close-conversation flow (not stored as stage). */
const CLOSE_STAGE = {
  notSelected: "__close_not_selected__",
  withdrew: "__close_withdrew__",
  notInterested: "__close_not_interested__",
} as const;

const STAGE_SELECT_OPTIONS = [
  ...STAGES,
  { value: CLOSE_STAGE.notSelected, label: "━━ Close: Not selected" },
  { value: CLOSE_STAGE.withdrew, label: "━━ Close: Withdrew" },
  { value: CLOSE_STAGE.notInterested, label: "━━ Close: Not interested in MUA" },
];

function isCloseStageValue(value: string): boolean {
  return value.startsWith("__close_");
}

const STAGE_CHIP: Record<string, string> = {
  initialContact: "bg-slate-100 text-slate-700",
  offerSent: "bg-blue-100 text-blue-800",
  followUpDone: "bg-indigo-100 text-indigo-800",
  negotiating: "bg-amber-100 text-amber-900",
  brideSelected: "bg-emerald-100 text-emerald-800",
};

const CEREMONY_ICON: Record<string, string> = {
  Haldi: "🌿",
  Mehndi: "💐",
  Wedding: "💍",
  Sangeet: "🎵",
  Reception: "🎊",
};

const URGENCY_PILL: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  hot: "bg-orange-100 text-orange-800 border-orange-200",
  active: "bg-yellow-100 text-yellow-900 border-yellow-200",
  longShelf: "bg-slate-100 text-slate-700 border-slate-200",
};

const SYSTEM_ENTRIES: CommEntryType[] = [
  "leadCreated",
  "assigned",
  "shiftedCommission",
];

const RM_ENTRIES: CommEntryType[] = [
  "muaPushed",
  "stageUpdated",
  "capBypass",
  "callLogged",
  "callyzerSynced",
  "whatsappLogged",
];

const BOOKING_ENTRIES: CommEntryType[] = ["bookingConfirmed"];

const EXIT_ENTRIES: CommEntryType[] = ["hostileFlagged"];

const ENTRY_ICON: Partial<Record<CommEntryType, LucideIcon>> = {
  leadCreated: UserPlus,
  assigned: ArrowRight,
  muaPushed: Send,
  stageUpdated: RefreshCw,
  bookingConfirmed: CheckCircle,
  capBypass: Zap,
  shiftedCommission: ArrowRightLeft,
  callLogged: Phone,
  callyzerSynced: Phone,
  whatsappLogged: MessageSquare,
};

interface LeadProfileClientProps {
  leadId: string;
  commissionMode?: boolean;
  feedbackMode?: boolean;
  backHref?: string;
}

/** Whether the current lead owner may manage this push (stage, quote, close). */
function canManagePush(
  push: MuaPushWithDetails,
  feedbackMode: boolean
): boolean {
  if (feedbackMode) return false;
  return push.status === "active" || push.status === "awaitingClose";
}

export function LeadProfileClient({
  leadId,
  commissionMode = false,
  feedbackMode = false,
  backHref = "/rm/queue",
}: LeadProfileClientProps) {
  const { toast } = useToast();
  const [lead, setLead] = useState<LeadFull | null>(null);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [comms, setComms] = useState<CommEntry[]>([]);
  const [pushes, setPushes] = useState<MuaPushWithDetails[]>([]);
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [closeModal, setCloseModal] = useState<MuaPushWithDetails | null>(null);
  const [closing, setClosing] = useState(false);
  const [quoteModal, setQuoteModal] = useState<MuaPushWithDetails | null>(null);
  const [pushOpen, setPushOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pushEventPrices, setPushEventPrices] = useState<MuaPushEventPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stageOpen, setStageOpen] = useState(true);
  const [budgetQuoteOpen, setBudgetQuoteOpen] = useState(false);
  const [portalCap, setPortalCap] = useState("");
  const [pendingStage, setPendingStage] = useState<{
    pushId: string;
    muaId: string;
    muaName: string;
    muaPhone?: string | null;
    muaWhatsapp?: string | null;
    currentStage: MuaPushStage;
    newStage: MuaPushStage;
  } | null>(null);
  const [stageSelectKey, setStageSelectKey] = useState(0);
  const [hostileOpen, setHostileOpen] = useState(false);
  const [shiftCommissionOpen, setShiftCommissionOpen] = useState(false);
  const [shiftingCommission, setShiftingCommission] = useState(false);
  const [hostileNote, setHostileNote] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [whatsappPushId, setWhatsappPushId] = useState("");
  const [hasFeedback, setHasFeedback] = useState(false);
  const [lastLeadContact, setLastLeadContact] = useState<LastLeadContact | null>(null);
  const [exportingLog, setExportingLog] = useState(false);

  const exportLeadLog = useCallback(async () => {
    setExportingLog(true);
    const err = await downloadLeadLogCsv(leadId);
    setExportingLog(false);
    if (err) toast(err);
  }, [leadId, toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [leadRes, pushRes, feedbackRes] = await Promise.all([
      fetch(`/api/leads/${leadId}`),
      fetch(`/api/leads/${leadId}/pushes`),
      fetch(`/api/leads/${leadId}/feedback`),
    ]);
    const leadJson = (await leadRes.json()) as {
      data: {
        lead: LeadFull;
        events: LeadEvent[];
        comms: CommEntry[];
        bookings?: Booking[];
        pushEventPrices?: MuaPushEventPrice[];
        lastLeadContact?: LastLeadContact | null;
      } | null;
      error?: string;
    };
    const pushJson = (await pushRes.json()) as { data: MuaPushWithDetails[] | null };
    if (!leadRes.ok) {
      setLoadError(leadJson.error ?? "You do not have access to this lead");
      setLead(null);
      setPushes([]);
      setLoading(false);
      return;
    }
    if (leadJson.data) {
      setLead(leadJson.data.lead);
      setPortalCap(
        leadJson.data.lead.portalCap != null
          ? String(leadJson.data.lead.portalCap)
          : ""
      );
      setEvents(leadJson.data.events);
      setComms(leadJson.data.comms);
      setBookings(leadJson.data.bookings ?? []);
      setPushEventPrices(leadJson.data.pushEventPrices ?? []);
      setLastLeadContact(leadJson.data.lastLeadContact ?? null);
    }
    setPushes(pushJson.data ?? []);
    const fbJson = (await feedbackRes.json()) as { data: unknown | null };
    setHasFeedback(!!fbJson.data);
    const active = (pushJson.data ?? []).filter(
      (p) => p.status === "active" || p.status === "awaitingClose",
    );
    setWhatsappPushId((prev) =>
      active.some((p) => p.id === prev) ? prev : (active[0]?.id ?? ""),
    );
    setLoading(false);
  }, [leadId]);

  const allEventsPast = useMemo(() => {
    if (!events.length) return false;
    const today = new Date().toISOString().slice(0, 10);
    return events.every(
      (e) => e.eventDate && e.eventDate.slice(0, 10) < today
    );
  }, [events]);

  const activeDistinctMuas = useMemo(() => {
    const ids = new Set<string>();
    for (const p of pushes) {
      if (p.status !== "closed" && p.status !== "booked") ids.add(p.muaId);
    }
    return ids.size;
  }, [pushes]);

  const canPushMua = lead ? canPushMuaToLead(lead) : false;

  const feedbackEligible = useMemo(() => {
    if (!lead) return false;
    if (lead.status !== "expired" && lead.status !== "booked") return false;
    if (!events.length) return true;
    const today = new Date().toISOString().slice(0, 10);
    return events.every(
      (e) =>
        e.status === "notNeeded" ||
        Boolean(e.eventDate && e.eventDate.slice(0, 10) < today)
    );
  }, [lead, events]);

  const feedbackEventCity = useMemo(
    () => (lead ? resolveFeedbackEventCity(lead, events) : "your city"),
    [lead, events]
  );

  const bookedEventIds = useMemo(
    () =>
      new Set(bookings.filter((b) => !b.cancelled).map((b) => b.eventId)),
    [bookings]
  );

  const openCeremoniesToBook = useMemo(
    () =>
      events.filter(
        (e) => e.status === "open" && !bookedEventIds.has(e.id)
      ),
    [events, bookedEventIds]
  );

  const canConfirmBooking = openCeremoniesToBook.length > 0;
  const requireCommissionAtBook = lead
    ? leadTracksCommissionSync({
        shiftedAt: lead.shiftedAt,
        status: lead.status,
      })
    : false;
  const bookingBlockedHint =
    "All ceremonies are booked. Cancel a booking on the Bookings tab to reopen a ceremony.";

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const hasQuotes = pushEventPrices.length > 0;
    setBudgetQuoteOpen(hasQuotes);
  }, [pushEventPrices.length]);

  async function savePortal(pushed: boolean, cap?: number | null) {
    const res = await fetch(`/api/leads/${leadId}/portal`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portalPushed: pushed,
        portalCap: cap ?? null,
      }),
    });
    if (res.ok) void load();
  }

  async function confirmStageUpdate(
    note: string,
    followUpDate: string | null
  ): Promise<boolean> {
    if (!pendingStage) return false;
    const { pushId, newStage } = pendingStage;
    const stageRes = await fetch(`/api/pushes/${pushId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: newStage,
        note,
        followUpDate: followUpDate ?? undefined,
      }),
    });
    if (!stageRes.ok) {
      const err = (await stageRes.json().catch(() => ({}))) as { error?: string };
      toast(err.error ?? "Could not update stage");
      return false;
    }
    toast(
      followUpDate ? "Stage updated and follow-up scheduled" : "Stage updated"
    );
    setPendingStage(null);
    setStageSelectKey((k) => k + 1);
    void load();
    return true;
  }

  async function closeConversation(
    outcome: "not_selected" | "withdrew" | "not_interested"
  ) {
    const pushId = closeModal?.id;
    if (!pushId || closing) return;
    setClosing(true);
    try {
      const res = await fetch(`/api/pushes/${pushId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ close: { outcome } }),
      });
      const json = (await res.json()) as { error?: string | null };
      if (!res.ok) {
        toast(json.error ?? "Could not close conversation");
        return;
      }
      toast("Conversation closed");
      setCloseModal(null);
      if (outcome === "not_interested" || commissionMode) {
        notifyLeadRemovedFromQueue(leadId);
      }
      await load();
    } catch {
      toast("Could not close conversation");
    } finally {
      setClosing(false);
    }
  }

  async function exitLead(
    action: "not_interested" | "archive_not_interested" | "hostile",
    note?: string,
    commissionRmId?: string
  ) {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        note: action === "hostile" ? note?.trim() : undefined,
        commissionRmId,
      }),
    });
    if (res.ok) {
      toast(
        action === "hostile"
          ? "Marked Not Answering — uploader will review"
          : action === "archive_not_interested" || commissionMode
            ? "Marked Not Interested — uploader will review"
            : "Moved to Commission RM"
      );
      setHostileOpen(false);
      setHostileNote("");
      setShiftCommissionOpen(false);
      notifyLeadRemovedFromQueue(leadId);
      void load();
    } else {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast(err.error ?? "Could not update lead");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  if (loadError || !lead) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center">
        <p className="font-medium text-red-800">{loadError ?? "Lead not found"}</p>
        <Link
          href={backHref}
          className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
        >
          ← Back
        </Link>
      </div>
    );
  }

  const filteredPushes = eventFilter
    ? pushes.filter((p) => coerceStringArray(p.eventIds).includes(eventFilter))
    : pushes;

  const assignmentDay = (lead.daysSinceAssignment ?? 0) + 1;
  const assignmentPct = Math.min(100, ((lead.daysSinceAssignment ?? 0) / 45) * 100);
  const barColor =
    assignmentDay > 40
      ? "bg-red-500"
      : assignmentDay > 30
        ? "bg-amber-500"
        : "bg-brand";

  const pushSection = (
    <>
      {events.length > 0 && (
        <CeremoniesOverview
          events={events}
          leadBudgetAmount={lead?.budgetAmount}
        />
      )}

      <LeadBookingsPanel
        bookings={bookings}
        events={events}
        pushes={pushes}
        trackCommission={requireCommissionAtBook}
        onUpdated={() => void load()}
      />

      <EventChips
        events={events}
        eventFilter={eventFilter}
        onFilter={setEventFilter}
      />

      <section>
        <button
          type="button"
          className="mb-3 flex w-full items-center justify-between text-left"
          onClick={() => setBudgetQuoteOpen((o) => !o)}
        >
          <h2 className="text-lg font-semibold text-brand">Budget vs Quotes</h2>
          <span className="text-sm text-slate-muted">
            {budgetQuoteOpen ? "Hide" : "Show"}
          </span>
        </button>
        {budgetQuoteOpen && (
          <BudgetQuotePanel
            events={events}
            pushes={pushes}
            pushEventPrices={pushEventPrices}
          />
        )}
      </section>

      <EventPricingPanel
        events={events}
        pushes={pushes}
        pushEventPrices={pushEventPrices}
      />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-brand">
          {commissionMode ? "Commission pushes" : "MUA conversations"}
        </h2>
        <Card className="overflow-hidden p-0">
          <Table>
            <THead>
              <TR>
                <TH>MUA</TH>
                <TH>Plan</TH>
                <TH>Events</TH>
                <TH>Quoted</TH>
                <TH>Push status</TH>
                <TH>Stage</TH>
                <TH>Days</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {filteredPushes.length === 0 ? (
                <TR>
                  <TD colSpan={8} className="py-8 text-center text-slate-muted">
                    No pushes yet
                  </TD>
                </TR>
              ) : (
                filteredPushes.map((p) => (
                  <TR
                    key={p.id}
                    className={cn(
                      p.status === "awaitingClose"
                        ? "bg-amber-50/80"
                        : "bg-white"
                    )}
                  >
                    <TD>
                      <p className="font-medium">{p.muaName}</p>
                      {p.weeklyCap != null && (
                        <p className="text-[11px] text-slate-muted">
                          {p.weeklyPushesUsed ?? 0}/{p.weeklyCap} this week
                        </p>
                      )}
                      {p.status === "awaitingClose" && (
                        <span className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                          <AlertTriangle className="h-3 w-3" />
                          Awaiting close
                        </span>
                      )}
                    </TD>
                    <TD>
                      {p.planTier
                        ? PLAN_TIER_LABELS[p.planTier]
                        : "Non-plan"}
                    </TD>
                    <TD>{formatLabelsList(p.eventLabels)}</TD>
                    <TD>
                      <span>Rs. {p.quotedTotal?.toLocaleString("en-IN") ?? "—"}</span>
                      {(p.status === "active" || p.status === "awaitingClose") &&
                        canManagePush(p, feedbackMode) && (
                        <button
                          type="button"
                          className="ml-2 text-xs font-medium text-accent hover:underline"
                          onClick={() => setQuoteModal(p)}
                        >
                          Edit
                        </button>
                      )}
                    </TD>
                    <TD>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                          p.status === "awaitingClose"
                            ? "bg-amber-100 text-amber-900"
                            : p.status === "booked"
                              ? "bg-emerald-100 text-emerald-800"
                              : p.status === "closed"
                                ? "bg-slate-100 text-slate-600"
                                : "bg-blue-50 text-blue-800"
                        )}
                      >
                        {MUA_PUSH_STATUS_LABELS[p.status]}
                        {p.status === "closed" && p.outcome && (
                          <span className="ml-1 font-normal">
                            · {PUSH_OUTCOME_LABELS[p.outcome]}
                          </span>
                        )}
                      </span>
                    </TD>
                    <TD>
                      {p.status === "active" && canManagePush(p, feedbackMode) ? (
                        <Select
                          key={`${p.id}-${p.stage}-${stageSelectKey}`}
                          options={STAGE_SELECT_OPTIONS}
                          value={p.stage}
                          onChange={(e) => {
                            const ns = e.target.value;
                            if (isCloseStageValue(ns)) {
                              setStageSelectKey((k) => k + 1);
                              setCloseModal(p);
                              return;
                            }
                            const newStage = ns as MuaPushStage;
                            if (newStage === p.stage) return;
                            setPendingStage({
                              pushId: p.id,
                              muaId: p.muaId,
                              muaName: p.muaName,
                              muaPhone: p.muaPhone,
                              muaWhatsapp: p.muaWhatsapp,
                              currentStage: p.stage,
                              newStage,
                            });
                          }}
                          className="min-w-[180px]"
                        />
                      ) : (
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                            STAGE_CHIP[p.stage] ?? "bg-slate-100 text-slate-700"
                          )}
                        >
                          {MUA_PUSH_STAGE_LABELS[p.stage]}
                        </span>
                      )}
                    </TD>
                    <TD>{p.daysSincePush}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {(p.status === "active" || p.status === "awaitingClose") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setWhatsappPushId(p.id);
                              document
                                .getElementById("lead-mua-whatsapp")
                                ?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                          >
                            WhatsApp
                          </Button>
                        )}
                        {(p.status === "active" || p.status === "awaitingClose") &&
                          canManagePush(p, feedbackMode) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCloseModal(p)}
                          >
                            Close
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </Card>

        {!feedbackMode &&
        pushes.some((p) => p.status === "active" || p.status === "awaitingClose") ? (
          <div id="lead-mua-whatsapp">
            <Card className="mt-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-brand">WhatsApp — MUA</h3>
                <p className="text-xs text-slate-muted">
                  MUA-side templates. Pick the artist from the list — or use WhatsApp on a row above.
                </p>
              </div>
              <LeadMuaWhatsAppPanel
                leadId={lead.id}
                brideName={lead.brideName}
                leadCity={lead.eventLocation ?? lead.city}
                pushes={pushes}
                selectedPushId={whatsappPushId}
                onSelectedPushIdChange={setWhatsappPushId}
              />
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href={backHref} className="text-sm text-slate-muted hover:text-accent">
        ← Back
      </Link>

      {feedbackMode && feedbackEligible && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          <span>
            Post-event lead
            {lead.status === "booked" ? " (booked)" : ""} — log call outcome and feedback.
          </span>
          <div className="flex flex-wrap gap-2">
            <FeedbackRaiseCareTicketButton
              context="bride"
              label="Raise care ticket"
              variant="secondary"
              leadId={lead.id}
              brideName={lead.brideName}
              bridePhone={lead.phone}
              brideEmail={lead.email}
            />
            <Button size="sm" onClick={() => setFeedbackOpen(true)}>
              Log feedback
            </Button>
          </div>
        </div>
      )}

      {lead && feedbackMode && feedbackEligible && (
        <Card className="space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold text-brand">WhatsApp — Bride</h2>
            <p className="text-xs text-slate-muted">
              Bride-side templates for feedback follow-up calls.
            </p>
          </div>
          <WhatsAppComposer
            audience="bride"
            leadId={lead.id}
            bridePhone={lead.phone}
            context={{ brideName: lead.brideName, city: feedbackEventCity }}
            templatePool="feedback"
            allowCustomMessage
            onLogged={() => void load()}
          />
        </Card>
      )}

      {!feedbackMode && allEventsPast && !hasFeedback && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          <span>All ceremonies are past — collect post-event feedback.</span>
          <Button size="sm" onClick={() => setFeedbackOpen(true)}>
            Add feedback
          </Button>
        </div>
      )}

      <Card>
        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-brand">
              {lead.brideName}
            </h1>
            <p className="mt-1 text-sm text-slate-muted">
              {lead.displayId} · {lead.phone}
              {lead.email ? ` · ${lead.email}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="muted">{getLeadStatusLabel(lead)}</Badge>
              <Badge variant={lead.urgencyBand}>
                {URGENCY_LABELS[lead.urgencyBand]}
              </Badge>
              <Badge>{BUDGET_TIER_LABELS[lead.budgetTier]}</Badge>
              {lead.verified && <Badge variant="success">Verified</Badge>}
            </div>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="text-slate-muted">City</span>
                <br />
                {lead.city}
              </p>
              <p>
                <span className="text-slate-muted">Budget</span>
                <br />
                Rs. {lead.budgetAmount?.toLocaleString("en-IN") ?? "—"}
              </p>
            </div>
            {lastLeadContact ? (
              <p className="mt-3 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">
                <span className="font-semibold">Last contact (lead):</span>{" "}
                {new Date(lastLeadContact.at).toLocaleString("en-IN")}
                {lastLeadContact.direction
                  ? ` · ${lastLeadContact.direction === "inbound" ? "Incoming" : "Outgoing"}`
                  : ""}
                {lastLeadContact.durationSec != null && lastLeadContact.durationSec > 0
                  ? ` · ${Math.floor(lastLeadContact.durationSec / 60)}m ${lastLeadContact.durationSec % 60}s`
                  : ""}
                {lastLeadContact.actorName ? ` · ${lastLeadContact.actorName}` : ""}
                {` · ${formatLastLeadContactSource(lastLeadContact)}`}
              </p>
            ) : (
              <p className="mt-3 text-xs text-slate-muted">No bride contact logged yet.</p>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div
              className={cn(
                "rounded-xl border-2 px-4 py-3 text-center",
                URGENCY_PILL[lead.urgencyBand]
              )}
            >
              <p className="text-3xl font-bold tabular-nums">{lead.daysToEvent}</p>
              <p className="text-sm font-medium">
                days to event — {URGENCY_LABELS[lead.urgencyBand]}
              </p>
              <p className="mt-0.5 text-xs opacity-80">
                {formatDate(lead.eventDate)}
              </p>
            </div>

            {lead.assignmentDate && !commissionMode && (
              <div>
                <div className="mb-1 flex justify-between text-xs font-medium">
                  <span className="text-slate-muted">Assignment window</span>
                  <span className="text-brand">
                    Day {assignmentDay} of 45
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn("h-full rounded-full transition-all", barColor)}
                    style={{ width: `${assignmentPct}%` }}
                  />
                </div>
                {lead.assignmentDaysRemaining !== null && (
                  <p className="mt-1 text-xs text-slate-muted">
                    {lead.assignmentDaysRemaining} days remaining
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {!feedbackMode && (
          <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-5 py-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={lead.portalPushed ?? false}
                onChange={(e) =>
                  void savePortal(
                    e.target.checked,
                    portalCap ? Number(portalCap) : null
                  )
                }
              />
              Listed on olready.in
            </label>
            {lead.portalPushed && (
              <Input
                label="Portal cap"
                type="number"
                className="w-24"
                placeholder="No cap"
                value={portalCap}
                onChange={(e) => setPortalCap(e.target.value)}
                onBlur={() =>
                  void savePortal(
                    true,
                    portalCap ? Number(portalCap) : null
                  )
                }
              />
            )}
          </div>
        )}

        {!commissionMode && !feedbackMode && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
            {(!isLeadRequirementsConfirmed(lead) ||
              activeDistinctMuas < INTAKE_MIN_PROFILES) &&
              lead.status !== "archived" && (
                <div className="mb-2 w-full rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm">
                  {!isLeadRequirementsConfirmed(lead) ? (
                    <p className="font-medium text-brand">
                      Step 1: Complete bride confirmation call in{" "}
                      <Link href="/rm/tasks" className="underline">
                        Tasks
                      </Link>{" "}
                      before pushing MUAs
                    </p>
                  ) : (
                    <p className="font-medium text-brand">
                      Step 2: Share profiles — {activeDistinctMuas} /{" "}
                      {INTAKE_MIN_PROFILES} active MUAs pushed
                    </p>
                  )}
                </div>
              )}
            <span title={!canPushMua ? BRIDE_CONFIRMATION_PUSH_BLOCK_MESSAGE : undefined}>
              <Button
                size="sm"
                disabled={!canPushMua}
                onClick={() => setPushOpen(true)}
              >
                Push MUA Profile
              </Button>
            </span>
            <span title={!canConfirmBooking ? bookingBlockedHint : undefined}>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canConfirmBooking}
                onClick={() => setBookOpen(true)}
              >
                Confirm booking
              </Button>
            </span>
            {lead.status !== "archived" &&
              lead.status !== "commissionRm" &&
              lead.status !== "booked" && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShiftCommissionOpen(true)}
                  >
                    {LEAD_EXIT_LABELS.notInterestedPlanMuas}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void exitLead("archive_not_interested")}
                  >
                    {LEAD_EXIT_LABELS.notInterested}
                  </Button>
                </>
              )}
            {lead.status !== "archived" && (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => setHostileOpen(true)}
              >
                {LEAD_EXIT_LABELS.notAnswering}
              </Button>
            )}
          </div>
        )}
        {commissionMode && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
            <span title={!canPushMua ? BRIDE_CONFIRMATION_PUSH_BLOCK_MESSAGE : undefined}>
              <Button
                size="sm"
                disabled={!canPushMua}
                onClick={() => setPushOpen(true)}
              >
                Push non-plan MUA
              </Button>
            </span>
            <span title={!canConfirmBooking ? bookingBlockedHint : undefined}>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canConfirmBooking}
                onClick={() => setBookOpen(true)}
              >
                Confirm booking
              </Button>
            </span>
            {lead.status === "commissionRm" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void exitLead("archive_not_interested")}
              >
                {LEAD_EXIT_LABELS.notInterested}
              </Button>
            )}
            {lead.status !== "archived" && (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => setHostileOpen(true)}
              >
                {LEAD_EXIT_LABELS.notAnswering}
              </Button>
            )}
          </div>
        )}
      </Card>

      {lead && !feedbackMode && (
        <Card className="overflow-hidden p-0">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-brand">Bride profile</span>
                <span className="text-xs font-normal text-slate-muted">
                  {lead.brideName} · {lead.city}
                </span>
              </span>
              <span
                className="text-sm text-slate-400 transition-transform group-open:rotate-180"
                aria-hidden
              >
                ▾
              </span>
            </summary>
            <div className="border-t border-slate-100 px-4 pb-4 pt-3">
              <BrideProfileEditPanel
                lead={lead}
                events={events}
                onSaved={() => void load()}
                onContactLogged={() => void load()}
                showWhatsApp={false}
              />
            </div>
          </details>
        </Card>
      )}

      {lead && !feedbackMode && (
        <Card className="space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold text-brand">WhatsApp — Bride</h2>
            <p className="text-xs text-slate-muted">
              Bride-side templates. MUA conversations are below in the pushes section.
            </p>
          </div>
          <WhatsAppComposer
            audience="bride"
            leadId={lead.id}
            bridePhone={lead.phone}
            context={{ brideName: lead.brideName, city: lead.city }}
            templatePool="rmBride"
            onLogged={() => void load()}
          />
        </Card>
      )}

      {commissionMode && (
        <CommissionSplitView
          shiftedAt={lead.shiftedAt}
          comms={comms}
          pushes={pushes}
          bookings={bookings}
          events={events}
        />
      )}

      {commissionMode && (
        <CommissionFollowUpPanel lead={lead} onUpdated={() => void load()} />
      )}

      {lead && !feedbackMode && (
        <LeadActivityPanel
          leadId={leadId}
          events={events}
          eventDate={lead.eventDate}
          leadDefaults={{
            eventDate: lead.eventDate,
            eventLocation: lead.eventLocation,
            region: lead.region,
            budgetAmount: lead.budgetAmount,
            city: lead.city,
          }}
          onUpdated={() => void load()}
        />
      )}

      {pushSection}

      <div>
        <button
          type="button"
          onClick={() => setStageOpen((o) => !o)}
          className="mb-3 flex w-full items-center justify-between text-left"
        >
          <h2 className="text-lg font-semibold text-brand">Stage History</h2>
          <span className="text-sm text-slate-muted">{stageOpen ? "▾" : "▸"}</span>
        </button>
        {stageOpen && lead && (
          <StageTimeline comms={comms} leadStatus={lead.status} />
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-brand">Lead ledger</h2>
          <Button
            size="sm"
            variant="secondary"
            disabled={exportingLog || !lead}
            onClick={() => void exportLeadLog()}
          >
            {exportingLog ? "Exporting…" : "Export Lead Log"}
          </Button>
        </div>
        <LeadLedgerTimeline comms={comms} />
      </div>

      {pendingStage && lead && (
        <StageUpdateModal
          muaName={pendingStage.muaName}
          currentStage={pendingStage.currentStage}
          newStage={pendingStage.newStage}
          leadId={leadId}
          muaId={pendingStage.muaId}
          muaPhone={pendingStage.muaPhone}
          muaWhatsapp={pendingStage.muaWhatsapp}
          bridePhone={lead.phone}
          brideName={lead.brideName}
          leadCity={lead.eventLocation ?? lead.city}
          onConfirm={confirmStageUpdate}
          onClose={() => {
            setPendingStage(null);
            setStageSelectKey((k) => k + 1);
          }}
        />
      )}

      <PushMuaSlideOver
        open={pushOpen}
        onClose={() => setPushOpen(false)}
        leadId={leadId}
        urgencyBand={lead.urgencyBand}
        events={events}
        commissionMode={commissionMode}
        brideName={lead.brideName}
        leadCity={lead.eventLocation ?? lead.city}
        pushBlocked={!canPushMua}
        pushBlockedMessage={BRIDE_CONFIRMATION_PUSH_BLOCK_MESSAGE}
        onPushed={() => {
          toast("MUA pushed");
          void load();
        }}
      />

      <BookingModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        leadId={leadId}
        events={events}
        pushes={pushes}
        pushEventPrices={pushEventPrices}
        bookings={bookings}
        requireCommission={requireCommissionAtBook}
        commissionAgreed={lead?.commissionAgreed}
        commissionOffered={lead?.commissionOffered}
        onBooked={() => {
          toast("Booking confirmed");
          void load();
        }}
      />

      <ShiftToCommissionModal
        open={shiftCommissionOpen}
        onClose={() => {
          if (!shiftingCommission) setShiftCommissionOpen(false);
        }}
        brideName={lead?.brideName ?? "Lead"}
        busy={shiftingCommission}
        onConfirm={async (commissionRmId) => {
          setShiftingCommission(true);
          try {
            await exitLead("not_interested", undefined, commissionRmId);
          } finally {
            setShiftingCommission(false);
          }
        }}
      />

      <Modal
        open={hostileOpen}
        onClose={() => {
          setHostileOpen(false);
          setHostileNote("");
        }}
        title={LEAD_EXIT_LABELS.notAnswering}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setHostileOpen(false);
                setHostileNote("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={hostileNote.trim().length < 10}
              onClick={() => void exitLead("hostile", hostileNote)}
            >
              {LEAD_EXIT_LABELS.notAnswering}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-muted">
          Bride has stopped answering calls. Uploader and admin will review.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-text">What happened on calls? *</span>
          <textarea
            className="min-h-[100px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="e.g. no answer after 3 attempts (min 10 characters)"
            value={hostileNote}
            onChange={(e) => setHostileNote(e.target.value)}
          />
        </label>
      </Modal>

      {quoteModal && (
        <EditMuaQuoteModal
          push={quoteModal}
          events={events}
          pushEventPrices={pushEventPrices}
          onClose={() => setQuoteModal(null)}
          onSaved={() => {
            toast("Quote updated");
            void load();
          }}
        />
      )}

      {feedbackMode ? (
        <ExpiredFeedbackModal
          open={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
          leadId={leadId}
          brideName={lead.brideName}
          onSubmitted={() => {
            toast("Feedback saved");
            setHasFeedback(true);
            void load();
          }}
        />
      ) : (
        <FeedbackModal
          open={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
          leadId={leadId}
          brideName={lead.brideName}
          onSubmitted={() => {
            toast("Feedback saved");
            setHasFeedback(true);
            void load();
          }}
        />
      )}

      <Modal
        open={!!closeModal}
        onClose={() => {
          if (!closing) setCloseModal(null);
        }}
        title="Close conversation"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={closing}
              onClick={() => setCloseModal(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={closing}
              onClick={(e) => {
                e.stopPropagation();
                void closeConversation("not_selected");
              }}
            >
              Not selected
            </Button>
            <Button
              variant="secondary"
              disabled={closing}
              onClick={(e) => {
                e.stopPropagation();
                void closeConversation("not_interested");
              }}
            >
              Not interested in MUA
            </Button>
            <Button
              variant="ghost"
              disabled={closing}
              onClick={(e) => {
                e.stopPropagation();
                void closeConversation("withdrew");
              }}
            >
              Withdrew
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-muted">
          Close conversation with {closeModal?.muaName}? This frees a slot on this
          lead. Choose why the bride is not proceeding with this MUA.
        </p>
      </Modal>
    </div>
  );
}

function EventChips({
  events,
  eventFilter,
  onFilter,
}: {
  events: LeadEvent[];
  eventFilter: string | null;
  onFilter: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onFilter(null)}
        className={cn(
          "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
          !eventFilter
            ? "border-brand bg-brand text-white"
            : "border-slate-200 bg-white hover:border-accent"
        )}
      >
        All events
      </button>
      {events.map((ev) => {
        const icon = CEREMONY_ICON[ev.ceremonyType] ?? "📅";
        const booked = ev.status === "booked";
        return (
          <button
            key={ev.id}
            type="button"
            onClick={() => onFilter(ev.id)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              booked
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-slate-300 bg-white text-brand hover:border-accent",
              eventFilter === ev.id && !booked && "ring-2 ring-accent ring-offset-1"
            )}
          >
            {icon} {ev.ceremonyType}
            {ev.eventDate ? ` · ${formatDate(ev.eventDate)}` : ""}
            {booked ? " ✓" : ""}
          </button>
        );
      })}
    </div>
  );
}

function ledgerDotColor(type: CommEntryType): string {
  if (SYSTEM_ENTRIES.includes(type)) return "bg-slate-400";
  if (RM_ENTRIES.includes(type)) return "bg-brand";
  if (BOOKING_ENTRIES.includes(type)) return "bg-emerald-500";
  if (EXIT_ENTRIES.includes(type)) return "bg-red-500";
  return "bg-slate-300";
}

function LeadLedgerTimeline({ comms }: { comms: CommEntry[] }) {
  if (!comms.length) {
    return (
      <Card className="py-8 text-center text-sm text-slate-muted">
        No activity yet
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="relative space-y-0">
        <div
          className="absolute left-[88px] top-2 bottom-2 w-0.5 bg-slate-200"
          aria-hidden
        />
        {comms.map((c) => {
          const Icon = ENTRY_ICON[c.entryType];
          return (
            <div key={c.id} className="relative flex gap-4 py-3">
              <time className="w-[76px] shrink-0 pt-0.5 text-right text-[11px] text-slate-muted">
                {new Date(c.createdAt).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <div className="relative z-10 flex w-6 shrink-0 justify-center">
                <span
                  className={cn(
                    "mt-1.5 h-3 w-3 rounded-full ring-4 ring-white",
                    ledgerDotColor(c.entryType)
                  )}
                />
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-start gap-2">
                  {Icon && (
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-muted" />
                  )}
                  <div>
                    <p className="text-sm text-text">
                      <strong className="font-medium text-brand">
                        {c.actorName ?? "System"}
                      </strong>{" "}
                      — {c.description}
                    </p>
                    {c.entryType === "whatsappLogged" && c.metadata ? (
                      <>
                        {whatsAppTemplateLabel(c.metadata as Record<string, unknown>) ? (
                          <p className="mt-1 text-xs text-slate-muted">
                            Template: {whatsAppTemplateLabel(c.metadata as Record<string, unknown>)}
                          </p>
                        ) : null}
                        {whatsAppMessagePreview(c.metadata as Record<string, unknown>) ? (
                          <p className="mt-1 rounded border border-slate-100 bg-slate-50 p-2 text-xs text-slate-700">
                            {truncateWhatsAppPreview(
                              whatsAppMessagePreview(c.metadata as Record<string, unknown>)!,
                              320,
                            )}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
