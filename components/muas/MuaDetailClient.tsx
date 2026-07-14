"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { PushMuaSlideOver } from "@/components/leads/PushMuaSlideOver";
import { SelectLeadModal } from "@/components/muas/SelectLeadModal";
import { FeedbackRaiseCareTicketButton } from "@/components/grievances/FeedbackRaiseCareTicketButton";
import { MuaCareTicketsPanel } from "@/components/grievances/MuaCareTicketsPanel";
import { MuaFeedbackPanel } from "@/components/muas/MuaFeedbackPanel";
import { MuaBookingsPanel } from "@/components/muas/MuaBookingsPanel";
import { MuaPlanPortalPanel } from "@/components/muas/MuaPlanPortalPanel";
import { MuaPlanHistoryPanel } from "@/components/muas/MuaPlanHistoryPanel";
import { cn } from "@/lib/utils";
import type {
  CommEntry,
  CommEntryType,
  LeadEvent,
  LeadFull,
  MuaDetailProfile,
  MuaPlanHistoryRow,
  MuaPushLeadRow,
  PlanTier,
} from "@/lib/types";
import { BUDGET_TIER_LABELS, PLAN_TIER_LABELS, URGENCY_LABELS } from "@/lib/types";
import type { PaginatedResult } from "@/db/index";
import type { MuaCommRow } from "@/app/api/muas/[id]/comms/route";
import { MuaRegionPicker } from "@/components/muas/MuaRegionPicker";
import { MuaServicesPicker } from "@/components/muas/MuaServicesPicker";
import { MuaServiceOfferingsList } from "@/components/muas/MuaServiceOfferingsList";
import { CityInput } from "@/components/muas/CityInput";
import { useCityRegionLookup } from "@/lib/use-city-region-lookup";
import type { MuaServiceOffering } from "@/lib/mua-service-catalog";
import { formatRegions } from "@/lib/mua-region";
import { MUA_STATUS_LABELS } from "@/lib/mua-status-labels";
import { formatDate } from "@/lib/utils";
import { downloadMuaLedgerCsv } from "@/lib/download-mua-ledger";
import { downloadMuaPushesCsv } from "@/lib/download-mua-pushes";
import { downloadLeadLogCsv } from "@/lib/download-lead-log";
import { useToast } from "@/components/ui/Toast";
import type { Region } from "@/lib/types";

const PLAN_BADGE: Record<PlanTier, string> = {
  highestPrivy: "bg-amber-100 text-amber-900",
  phoenix2: "bg-indigo-100 text-indigo-900",
  phoenix: "bg-blue-100 text-blue-800",
  pro: "bg-slate-200 text-slate-800",
  prime: "bg-gray-100 text-gray-600",
};

function commDescription(description: string): string {
  return description.replace(/^\[Sales\]\s*/, "");
}

function ledgerDot(type: CommEntryType): string {
  if (["leadCreated", "leadVerified", "assigned"].includes(type)) return "bg-slate-400";
  if (["muaPushed", "stageUpdated", "callLogged", "whatsappLogged"].includes(type))
    return "bg-brand";
  if (type === "bookingConfirmed") return "bg-emerald-500";
  return "bg-slate-300";
}

export interface MuaDetailClientProps {
  muaId: string;
  backHref: string;
  backLabel?: string;
  canEdit?: boolean;
  canEditPlanFields?: boolean;
  showPushToLead?: boolean;
  leadQueueStatus?: "assigned" | "commissionRm";
  commissionMode?: boolean;
  showCreateCareTicket?: boolean;
  showCareTickets?: boolean;
  careTicketsReadOnly?: boolean;
  region?: string;
  leadHrefPrefix?: string;
  /** Base path for MUA ledger CSV export (admin/care reports API). */
  muaLedgerApiBase?: string;
}

export function MuaDetailClient({
  muaId,
  backHref,
  backLabel = "Back to MUAs",
  canEdit = false,
  canEditPlanFields = false,
  showPushToLead = false,
  leadQueueStatus = "assigned",
  commissionMode = false,
  showCreateCareTicket = false,
  showCareTickets = false,
  careTicketsReadOnly = false,
  region,
  leadHrefPrefix = "/rm/leads",
  muaLedgerApiBase = "/api/admin/reports",
}: MuaDetailClientProps) {
  const { toast } = useToast();
  const [profile, setProfile] = useState<MuaDetailProfile | null>(null);
  const [pushes, setPushes] = useState<MuaPushLeadRow[]>([]);
  const [comms, setComms] = useState<MuaCommRow[]>([]);
  const [history, setHistory] = useState<MuaPlanHistoryRow[]>([]);
  const [tab, setTab] = useState<
    "pushes" | "comms" | "history" | "bookings" | "feedback" | "plan" | "care"
  >("pushes");
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [selectLeadOpen, setSelectLeadOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [pushLead, setPushLead] = useState<LeadFull | null>(null);
  const [pushEvents, setPushEvents] = useState<LeadEvent[]>([]);
  const [exportingMuaLedger, setExportingMuaLedger] = useState(false);
  const [exportingPushes, setExportingPushes] = useState(false);
  const [exportingLeadLogId, setExportingLeadLogId] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    phone: "",
    whatsapp: "",
    instagram: "",
    specialties: "",
    serviceOfferings: [] as MuaServiceOffering[],
    bio: "",
    city: "",
    regions: [] as Region[],
    regionsTouched: false,
    showBusiness: false,
    businessName: "",
    officialAddress: "",
    gstNumber: "",
    email: "",
    alternatePhone: "",
    businessManagerPhone: "",
    avgRevenueTarget: "",
    preferredContactChannel: "",
    planExpiry: "",
    notes: "",
    rosterStatus: "active",
  });

  const { regions: lookedUpRegions } = useCityRegionLookup(editOpen ? editForm.city : "");

  const load = useCallback(async () => {
    setLoading(true);
    const [profRes, pushRes, commRes, histRes] = await Promise.all([
      fetch(`/api/muas/${muaId}`),
      fetch(`/api/muas/${muaId}/pushes?pageSize=50`),
      fetch(`/api/muas/${muaId}/comms`),
      fetch(`/api/muas/${muaId}/plan-history`),
    ]);
    const profJson = (await profRes.json()) as { data: MuaDetailProfile | null };
    const pushJson = (await pushRes.json()) as {
      data: PaginatedResult<MuaPushLeadRow> | null;
    };
    const commJson = (await commRes.json()) as { data: MuaCommRow[] | null };
    const histJson = (await histRes.json()) as { data: MuaPlanHistoryRow[] | null };
    const p = profJson.data;
    setProfile(p);
    setPushes(pushJson.data?.data ?? []);
    setComms(commJson.data ?? []);
    setHistory(histJson.data ?? []);
    if (p) {
      setEditForm({
        phone: p.phone ?? "",
        whatsapp: p.whatsapp ?? "",
        instagram: p.instagram ?? "",
        specialties: (p.specialties ?? []).join(", "),
        serviceOfferings: p.serviceOfferings ?? [],
        bio: p.bio ?? "",
        city: p.city ?? "",
        regions: p.regions ?? [],
        regionsTouched: false,
        showBusiness: Boolean(
          p.businessName ||
            p.officialAddress ||
            p.gstNumber ||
            p.email ||
            p.alternatePhone ||
            p.businessManagerPhone ||
            p.avgRevenueTarget != null
        ),
        businessName: p.businessName ?? "",
        officialAddress: p.officialAddress ?? "",
        gstNumber: p.gstNumber ?? "",
        email: p.email ?? "",
        alternatePhone: p.alternatePhone ?? "",
        businessManagerPhone: p.businessManagerPhone ?? "",
        avgRevenueTarget: p.avgRevenueTarget != null ? String(p.avgRevenueTarget) : "",
        preferredContactChannel: p.preferredContactChannel ?? "",
        planExpiry: p.planExpiry?.slice(0, 10) ?? "",
        notes: "",
        rosterStatus: p.status === "inactive" ? "inactive" : "active",
      });
    }
    setLoading(false);
  }, [muaId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportMuaLedger() {
    setExportingMuaLedger(true);
    const err = await downloadMuaLedgerCsv(
      muaLedgerApiBase,
      new URLSearchParams({ muaId })
    );
    setExportingMuaLedger(false);
    if (err) toast(err);
  }

  async function exportPushes() {
    setExportingPushes(true);
    const err = await downloadMuaPushesCsv(muaId, profile?.displayId);
    setExportingPushes(false);
    if (err) toast(err);
  }

  async function exportLeadLog(leadId: string) {
    setExportingLeadLogId(leadId);
    const err = await downloadLeadLogCsv(leadId);
    setExportingLeadLogId(null);
    if (err) toast(err);
  }

  useEffect(() => {
    if (!editOpen || editForm.regionsTouched || lookedUpRegions.length === 0) return;
    setEditForm((f) => {
      if (
        f.regions.length === lookedUpRegions.length &&
        f.regions.every((r, i) => r === lookedUpRegions[i])
      ) {
        return f;
      }
      return { ...f, regions: lookedUpRegions };
    });
  }, [editOpen, editForm.regionsTouched, lookedUpRegions]);

  async function saveProfile() {
    const phone = editForm.phone.replace(/\D/g, "").slice(-10);
    const whatsappRaw = editForm.whatsapp.replace(/\D/g, "").slice(-10);
    const whatsapp = whatsappRaw.length === 10 ? whatsappRaw : phone;

    const payload: Record<string, unknown> = {
      phone: phone || null,
      whatsapp: whatsapp || null,
      instagram: editForm.instagram || null,
      city: editForm.city.trim() || undefined,
      specialties: editForm.specialties
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      serviceOfferings: editForm.serviceOfferings,
      bio: editForm.bio.trim() || null,
      regions: editForm.regions,
      businessName: editForm.businessName.trim() || null,
      officialAddress: editForm.officialAddress.trim() || null,
      gstNumber: editForm.gstNumber.trim() || null,
      email: editForm.email.trim() || null,
      alternatePhone: editForm.alternatePhone.replace(/\D/g, "").slice(-10) || null,
      businessManagerPhone: editForm.businessManagerPhone.replace(/\D/g, "").slice(-10) || null,
      avgRevenueTarget: editForm.avgRevenueTarget.trim()
        ? Number(editForm.avgRevenueTarget)
        : null,
      preferredContactChannel: editForm.preferredContactChannel.trim() || null,
    };

    if (canEditPlanFields) {
      payload.planExpiry = editForm.planExpiry || null;
      payload.notes = editForm.notes || null;
      payload.status = editForm.rosterStatus;
    }

    const res = await fetch(`/api/muas/${muaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setEditOpen(false);
      void load();
    }
  }

  async function handleLeadSelected(lead: LeadFull) {
    setPushLead(lead);
    const res = await fetch(`/api/leads/${lead.id}`);
    const json = (await res.json()) as {
      data: { events: LeadEvent[] } | null;
    };
    setPushEvents(json.data?.events ?? []);
    setPushOpen(true);
  }

  if (loading || !profile) {
    return <div className="h-48 animate-pulse rounded-xl bg-slate-200" />;
  }

  const initials = profile.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const expiryDays = profile.planExpiry
    ? Math.ceil((new Date(profile.planExpiry).getTime() - Date.now()) / 86400000)
    : null;
  const capPct =
    profile.weeklyCap > 0
      ? Math.min(100, (profile.weeklyUsed / profile.weeklyCap) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href={backHref} className="text-sm text-slate-muted hover:text-accent">
        ← {backLabel}
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
              {initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-brand">{profile.name}</h1>
                {profile.planTier ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      PLAN_BADGE[profile.planTier]
                    )}
                  >
                    {PLAN_TIER_LABELS[profile.planTier]}
                  </span>
                ) : (
                  <Badge variant="muted">Non-plan</Badge>
                )}
                <Badge variant={profile.status === "active" ? "success" : "muted"}>
                  {MUA_STATUS_LABELS[profile.status] ?? profile.status}
                </Badge>
              </div>
              <p className="text-sm text-slate-muted">
                {profile.displayId} · {profile.city} ·{" "}
                {formatRegions(profile.regions)}
              </p>
              {profile.bio ? (
                <p className="mt-2 text-sm text-text">{profile.bio}</p>
              ) : null}
              {(profile.serviceOfferings?.length ?? profile.services?.length ?? 0) > 0 && (
                <div className="mt-1 text-xs text-slate-muted">
                  <span className="font-medium">Services: </span>
                  <MuaServiceOfferingsList
                    offerings={profile.serviceOfferings}
                    fallbackNames={profile.services}
                  />
                </div>
              )}
              {(profile.specialties?.length ?? 0) > 0 && (
                <p className="mt-1 text-xs text-slate-muted">
                  Specialties: {profile.specialties!.join(" · ")}
                </p>
              )}
              <p className="mt-2 text-sm text-slate-muted">
                Phone: {profile.phone ?? "—"} · WhatsApp: {profile.whatsapp ?? "—"}
                {profile.email?.trim() ? ` · Email: ${profile.email.trim()}` : ""} · Instagram:{" "}
                {profile.instagram ? `@${profile.instagram.replace(/^@/, "")}` : "—"}
              </p>
              <p className="mt-1 text-sm text-slate-muted">
                Plan RM: {profile.planRmName ?? "—"} · Assigned RM: {profile.assignedRmName ?? "—"}
              </p>
              {profile.salesCallSummary && profile.salesCallSummary.totalCalls > 0 ? (
                <p className="mt-2 rounded-md border border-teal-200 bg-teal-50 px-2 py-1.5 text-xs text-teal-900">
                  Callyzer / sales calls: {profile.salesCallSummary.callyzerCalls} of {profile.salesCallSummary.totalCalls} via sync
                  {profile.salesCallSummary.lastCallAt
                    ? ` · Last call ${new Date(profile.salesCallSummary.lastCallAt).toLocaleString("en-IN")}`
                    : ""}
                  {profile.salesCallSummary.lastCallOutcome
                    ? ` (${profile.salesCallSummary.lastCallOutcome})`
                    : ""}
                </p>
              ) : null}
              <p className="text-xs text-slate-muted">
                Joined {profile.joinDate ? formatDate(profile.joinDate) : "—"}
                {profile.planExpiry && (
                  <span
                    className={cn(
                      expiryDays !== null && expiryDays <= 30 && "text-amber-600 font-medium"
                    )}
                  >
                    {" "}
                    · Plan expires {formatDate(profile.planExpiry)}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
                Edit profile
              </Button>
            )}
            {showPushToLead && (
              <Button size="sm" onClick={() => setSelectLeadOpen(true)}>
                Push to lead
              </Button>
            )}
            {showCreateCareTicket && profile && (
              <FeedbackRaiseCareTicketButton
                context="mua"
                muaId={muaId}
                muaName={profile.name}
                muaPhone={profile.phone}
                muaEmail={profile.email}
              />
            )}
          </div>
        </div>

        {profile.weeklyCap > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-slate-muted">Weekly cap</span>
              <span className="font-semibold">
                {profile.weeklyUsed} / {profile.weeklyCap}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${capPct}%` }}
              />
            </div>
          </div>
        )}
        {profile.planTier && (
          <p className="mt-3 text-xs text-slate-muted">
            Plan commitments: Weekly cap {profile.weeklyCap}/week
            {profile.monthlyPushTarget != null && (
              <> · Monthly target {profile.monthlyPushTarget} pushes/month</>
            )}
            {(profile.assuredBookings ?? 0) > 0 && (
              <> · Assured bookings {profile.assuredBookings}/period</>
            )}
          </p>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Total pushes", value: profile.totalPushes },
          {
            label: "Bookings",
            value: profile.totalBookings,
            hint:
              (profile.feedbackBookings ?? 0) > 0
                ? `${profile.formalBookings ?? profile.totalBookings} formal · ${profile.feedbackBookings} feedback`
                : undefined,
          },
          { label: "Conversion", value: `${profile.conversionPct}%` },
          { label: "Weekly usage", value: profile.weeklyUsed },
          { label: "Active convos", value: profile.activePushes },
        ].map((kpi) => (
          <Card key={kpi.label} className="p-3 text-center">
            <p className="text-2xl font-bold text-brand">{kpi.value}</p>
            <p className="text-xs text-slate-muted">{kpi.label}</p>
            {"hint" in kpi && kpi.hint ? (
              <p className="mt-0.5 text-[10px] text-slate-muted">{kpi.hint}</p>
            ) : null}
          </Card>
        ))}
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(
          [
            ["pushes", "Leads & Pushes"],
            ["comms", "Communications"],
            ["history", "Plan History"],
            ["bookings", "Bookings"],
            ["feedback", "Bride feedback"],
            ["plan", "Plan & portal"],
            ...(showCareTickets ? ([["care", "Care tickets"]] as const) : []),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm -mb-px",
              tab === id ? "border-accent text-accent font-medium" : "border-transparent"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "pushes" && (
        <Card className="p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-muted">
              {pushes.length > 0
                ? `Showing ${pushes.length} recent push${pushes.length === 1 ? "" : "es"}`
                : "No pushes yet"}
            </p>
            <Button
              size="sm"
              variant="secondary"
              disabled={exportingPushes}
              onClick={() => void exportPushes()}
            >
              {exportingPushes ? "Exporting…" : "Download CSV"}
            </Button>
          </div>
          {pushes.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-muted">No leads pushed to this MUA</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Bride</TH>
                  <TH>ID</TH>
                  <TH>Tier</TH>
                  <TH>Urgency</TH>
                  <TH>Stage</TH>
                  <TH>RM</TH>
                </TR>
              </THead>
              <TBody>
                {pushes.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`${leadHrefPrefix}/${p.leadId}`} className="font-medium text-accent">
                        {p.brideName}
                      </Link>
                    </TD>
                    <TD className="font-mono text-xs">{p.displayId}</TD>
                    <TD>{BUDGET_TIER_LABELS[p.budgetTier]}</TD>
                    <TD>
                      <Badge variant={p.urgencyBand}>{URGENCY_LABELS[p.urgencyBand]}</Badge>
                    </TD>
                    <TD className="capitalize text-xs">{p.stage.replace(/([A-Z])/g, " $1")}</TD>
                    <TD className="text-xs">{p.rmName ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === "comms" && (
        <Card className="p-4">
          <div className="mb-4 flex flex-wrap justify-end">
            <Button
              size="sm"
              variant="secondary"
              disabled={exportingMuaLedger}
              onClick={() => void exportMuaLedger()}
            >
              {exportingMuaLedger ? "Exporting…" : "Export MUA Ledger"}
            </Button>
          </div>
          {comms.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-muted">No communications</p>
          ) : (
            <div className="relative space-y-0">
              <div className="absolute left-[88px] top-2 bottom-2 w-0.5 bg-slate-200" />
              {comms.map((c) => (
                <div key={c.id} className="relative flex gap-4 py-3">
                  <time className="w-[76px] shrink-0 text-right text-[11px] text-slate-muted">
                    {new Date(c.createdAt).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <span
                    className={cn(
                      "relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full ring-4 ring-white",
                      ledgerDot(c.entryType as CommEntryType)
                    )}
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    {c.leadId ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`${leadHrefPrefix}/${c.leadId}`}
                          className="font-medium text-accent"
                        >
                          {c.leadName}
                        </Link>
                        <span className="text-slate-muted">({c.leadDisplayId})</span>
                        <button
                          type="button"
                          className="text-xs text-accent hover:underline disabled:opacity-50"
                          disabled={exportingLeadLogId === c.leadId}
                          onClick={() => void exportLeadLog(c.leadId!)}
                        >
                          {exportingLeadLogId === c.leadId
                            ? "Exporting…"
                            : "Export lead log"}
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium text-brand">
                        Sales{c.actorName ? ` · ${c.actorName}` : ""}
                      </span>
                    )}
                    <p className="mt-0.5 text-text">{commDescription(c.description)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "history" && (
        <MuaPlanHistoryPanel muaId={muaId} history={history} title="All plans to date" />
      )}

      {tab === "bookings" && (
        <MuaBookingsPanel muaId={muaId} leadHrefPrefix={leadHrefPrefix} />
      )}

      {tab === "feedback" && (
        <MuaFeedbackPanel muaId={muaId} leadHrefPrefix={leadHrefPrefix} />
      )}

      {tab === "plan" && (
        <MuaPlanPortalPanel muaId={muaId} canEdit={canEdit} planHistory={history} />
      )}

      {tab === "care" && showCareTickets && (
        <MuaCareTicketsPanel muaId={muaId} readOnly={careTicketsReadOnly} />
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit MUA profile"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveProfile()}>Save</Button>
          </>
        }
      >
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {canEditPlanFields && (
            <Select
              label="Roster visibility"
              value={editForm.rosterStatus}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, rosterStatus: e.target.value }))
              }
              options={[
                { value: "active", label: MUA_STATUS_LABELS.active },
                { value: "inactive", label: MUA_STATUS_LABELS.inactive },
              ]}
            />
          )}
          <CityInput
            value={editForm.city}
            onChange={(city) =>
              setEditForm((f) => ({ ...f, city, regionsTouched: false }))
            }
          />
          <MuaRegionPicker
            value={editForm.regions}
            onChange={(regions) => setEditForm((f) => ({ ...f, regions, regionsTouched: true }))}
          />
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text">About / bio</span>
            <textarea
              className="min-h-[80px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={editForm.bio}
              onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
            />
          </label>
          <MuaServicesPicker
            value={editForm.serviceOfferings}
            onChange={(serviceOfferings) => setEditForm((f) => ({ ...f, serviceOfferings }))}
          />
          <Input
            label="Phone"
            value={editForm.phone}
            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <Input
            label="WhatsApp"
            placeholder="Defaults to phone if blank"
            value={editForm.whatsapp}
            onChange={(e) => setEditForm((f) => ({ ...f, whatsapp: e.target.value }))}
          />
          <Input
            label="Instagram"
            value={editForm.instagram}
            onChange={(e) => setEditForm((f) => ({ ...f, instagram: e.target.value }))}
          />
          <Input
            label="Specialties (comma-separated)"
            value={editForm.specialties}
            onChange={(e) => setEditForm((f) => ({ ...f, specialties: e.target.value }))}
          />
          <button
            type="button"
            className="text-sm font-medium text-accent underline"
            onClick={() => setEditForm((f) => ({ ...f, showBusiness: !f.showBusiness }))}
          >
            {editForm.showBusiness ? "Hide" : "Show"} business details
          </button>
          {editForm.showBusiness ? (
            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              <Input
                label="Business / brand name"
                value={editForm.businessName}
                onChange={(e) => setEditForm((f) => ({ ...f, businessName: e.target.value }))}
              />
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-text">Official address</span>
                <textarea
                  className="min-h-[60px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.officialAddress}
                  onChange={(e) => setEditForm((f) => ({ ...f, officialAddress: e.target.value }))}
                />
              </label>
              <Input
                label="GST number"
                value={editForm.gstNumber}
                onChange={(e) => setEditForm((f) => ({ ...f, gstNumber: e.target.value }))}
              />
              <Input
                label="Email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
              <Input
                label="Alternate phone"
                value={editForm.alternatePhone}
                onChange={(e) => setEditForm((f) => ({ ...f, alternatePhone: e.target.value }))}
              />
              <Input
                label="Business manager phone"
                value={editForm.businessManagerPhone}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, businessManagerPhone: e.target.value }))
                }
              />
              <Input
                label="Avg revenue target (₹ reference)"
                type="number"
                min={0}
                value={editForm.avgRevenueTarget}
                onChange={(e) => setEditForm((f) => ({ ...f, avgRevenueTarget: e.target.value }))}
              />
              <Input
                label="Preferred contact channel"
                value={editForm.preferredContactChannel}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, preferredContactChannel: e.target.value }))
                }
              />
            </div>
          ) : null}
          {canEditPlanFields ? (
            <>
              <Input
                label="Plan expiry"
                type="date"
                value={editForm.planExpiry}
                onChange={(e) => setEditForm((f) => ({ ...f, planExpiry: e.target.value }))}
              />
              <Input
                label="Notes"
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </>
          ) : null}
        </div>
      </Modal>

      <SelectLeadModal
        open={selectLeadOpen}
        onClose={() => setSelectLeadOpen(false)}
        queueStatus={leadQueueStatus}
        region={region}
        onSelect={(lead) => void handleLeadSelected(lead)}
      />

      {pushLead && (
        <PushMuaSlideOver
          open={pushOpen}
          onClose={() => setPushOpen(false)}
          leadId={pushLead.id}
          urgencyBand={pushLead.urgencyBand}
          events={pushEvents}
          commissionMode={commissionMode}
          preselectedMuaId={muaId}
          onPushed={() => {
            void load();
            setPushOpen(false);
          }}
        />
      )}
    </div>
  );
}
