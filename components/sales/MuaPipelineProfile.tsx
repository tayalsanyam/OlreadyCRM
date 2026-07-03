"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StageChangePanel } from "@/components/sales/StageChangePanel";
import { OnboardingChecklistFlow } from "@/components/sales/checklists/OnboardingChecklistFlow";
import { LogEntryPanel } from "@/components/sales/LogEntryPanel";
import { CommsTimeline } from "@/components/sales/CommsTimeline";
import { CallsTab } from "@/components/sales/tabs/CallsTab";
import { AIChatPanel } from "@/components/sales/AIChatPanel";
import { MuaProfileDetailsTab } from "@/components/sales/MuaProfileDetailsTab";
import {
  ProfileAvatar,
  ProfileCollapsibleSection,
  ProfileContactLinks,
  ProfileEmptyState,
  ProfileSection,
  ProfileStatCard,
} from "@/components/sales/ProfileFieldGrid";
import { PipelineStageTrack } from "@/components/sales/PipelineStageTrack";
import { deriveSalesProfileStatus } from "@/lib/sales-profile-status";
import { formatStageLogPlanSummary } from "@/lib/stage-log-plan";
import { paymentBalanceLabel } from "@/lib/sales-deal-payment";
import { resolveMuaRegions } from "@/lib/mua-region";
import { salesPipelineMuaTypeLabel } from "@/lib/sales-pipeline-labels";
import { PLAN_TIER_LABELS, type PipelineStage, type PlanTier, type Region } from "@/lib/types";

const TABS = ["overview", "profile", "stageLog", "tasks", "calls", "checklists", "ledger"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview",
  profile: "Profile",
  stageLog: "Stage Log",
  tasks: "Tasks",
  calls: "Calls",
  checklists: "Checklists",
  ledger: "Ledger",
};

function formatDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function pipelineWhatsApp(data: {
  pipeline?: {
    stage?: PipelineStage;
    muaName?: string | null;
    muaPhone?: string | null;
    muaCity?: string | null;
    whatsapp?: string | null;
  };
}) {
  return {
    pipelineStage: data.pipeline?.stage,
    muaName: data.pipeline?.muaName,
    muaPhone: data.pipeline?.muaPhone,
    muaWhatsapp: data.pipeline?.whatsapp,
    muaCity: data.pipeline?.muaCity,
  };
}

export function MuaPipelineProfile({
  open,
  onClose,
  pipelineId,
  initialTab,
  onPipelineUpdated,
}: {
  open: boolean;
  onClose: () => void;
  pipelineId: string | null;
  initialTab?: Tab;
  onPipelineUpdated?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "overview");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [comms, setComms] = useState<{ sales: any[]; prior: any[]; page?: any }>({ sales: [], prior: [], page: null });
  const [salesOffset, setSalesOffset] = useState(0);
  const [priorOffset, setPriorOffset] = useState(0);
  const [pageLimit] = useState(20);
  const [stageOpen, setStageOpen] = useState(false);
  const [stagePreset, setStagePreset] = useState<PipelineStage | undefined>(undefined);

  const mergeUniqueById = (existing: any[], incoming: any[]) => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const item of [...existing, ...incoming]) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
    return out;
  };

  const load = useCallback(async (opts?: { append?: boolean; nextSalesOffset?: number; nextPriorOffset?: number }) => {
    if (!pipelineId) return;
    const append = Boolean(opts?.append);
    const sOffset = opts?.nextSalesOffset ?? 0;
    const pOffset = opts?.nextPriorOffset ?? 0;
    if (!append) {
      setLoading(true);
      setLoadError(null);
    }
    const [pipeRes, commsRes] = await Promise.all([
      fetch(`/api/sales/pipeline/${pipelineId}`),
      fetch(`/api/sales/pipeline/${pipelineId}/comms?salesOffset=${sOffset}&priorOffset=${pOffset}&limit=${pageLimit}`),
    ]);
    const a = await pipeRes.json().catch(() => ({}));
    const b = await commsRes.json().catch(() => ({}));
    if (!append) {
      setLoading(false);
      if (!pipeRes.ok) {
        setData(null);
        setLoadError(a?.error ?? "Could not load pipeline profile");
        return;
      }
      setLoadError(null);
    }
    setData(a.data ?? null);
    const incoming = b.data ?? { sales: [], prior: [], page: null };
    setComms((prev) => {
      if (!append) return incoming;
      return {
        sales: mergeUniqueById(prev.sales ?? [], incoming.sales ?? []),
        prior: mergeUniqueById(prev.prior ?? [], incoming.prior ?? []),
        page: incoming.page ?? prev.page,
      };
    });
  }, [pageLimit, pipelineId]);

  const handlePipelineRefresh = useCallback(() => {
    void load();
    onPipelineUpdated?.();
  }, [load, onPipelineUpdated]);

  useEffect(() => {
    if (open && pipelineId) {
      setSalesOffset(0);
      setPriorOffset(0);
      setTab(initialTab ?? "overview");
      void load({ append: false, nextSalesOffset: 0, nextPriorOffset: 0 });
    }
  }, [initialTab, load, open, pipelineId]);

  const artistRegions = useMemo(
    () =>
      resolveMuaRegions(
        (data?.muaRegions ?? []) as Region[],
        data?.pipeline?.muaCity ?? "",
      ),
    [data?.muaRegions, data?.pipeline?.muaCity],
  );
  const profileStatus = useMemo(
    () =>
      deriveSalesProfileStatus({
        pipelineStatus: data?.pipeline?.status,
        onboarding: data?.onboarding,
        training: data?.training,
        activation: data?.activation,
      }),
    [data]
  );
  const rmActionableTasks = useMemo(
    () => (data?.tasks ?? []).filter((t: { taskType?: string }) => t.taskType !== "salesActivation"),
    [data?.tasks],
  );
  const activationForwarded = useMemo(
    () => (data?.tasks ?? []).some((t: { taskType?: string }) => t.taskType === "salesActivation"),
    [data?.tasks],
  );
  const activationSentBackActive = useMemo(() => {
    const sentBack = data?.activation?.sentBackAt ?? (data?.activation as { sent_back_at?: string | null })?.sent_back_at;
    return Boolean(sentBack) && !data?.training?.complete;
  }, [data?.activation, data?.training?.complete]);
  const activationSentBackNote = String(
    data?.activation?.sentBackNote ?? (data?.activation as { sent_back_note?: string | null })?.sent_back_note ?? "",
  ).trim();
  return (
    <>
      <SlideOver open={open} onClose={onClose} title="MUA Profile" wide>
        {loading ? (
          <p className="text-sm text-slate-muted">Loading…</p>
        ) : loadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p>{loadError}</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : !data ? (
          <p className="text-sm text-slate-muted">No pipeline data.</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
              <div className="flex gap-3">
                <ProfileAvatar name={data.pipeline.muaName} size="lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <Badge>{data.pipeline.stage}</Badge>
                        <Badge variant="muted">{salesPipelineMuaTypeLabel(data.pipeline.muaType)}</Badge>
                        <Badge variant="muted">{profileStatus}</Badge>
                        {activationSentBackActive ? (
                          <Badge variant="muted">Activation issues</Badge>
                        ) : null}
                      </div>
                      <h2 className="truncate text-xl font-semibold text-brand">{data.pipeline.muaName}</h2>
                      <p className="text-xs text-slate-muted">
                        {data.pipeline.muaCity ?? "No city"}
                        {data.pipeline.muaSource ? ` · ${data.pipeline.muaSource}` : ""}
                        {data.pipeline.assignedToName ? ` · ${data.pipeline.assignedToName}` : " · Unassigned"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {data.pipeline.stage !== "Deal Closed" ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            setStagePreset(undefined);
                            setStageOpen(true);
                          }}
                        >
                          Change stage
                        </Button>
                      ) : null}
                      <Button size="sm" variant="secondary" onClick={() => setTab("profile")}>
                        Profile
                      </Button>
                    </div>
                  </div>
                  <ProfileContactLinks
                    phone={data.pipeline.muaPhone}
                    whatsapp={data.pipeline.whatsapp}
                    instagram={data.pipeline.instagram}
                    email={data.pipeline.muaEmail}
                  />
                </div>
              </div>
            </div>

            {activationSentBackActive ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">Activation issues — fix training</p>
                <p className="mt-1 text-xs">
                  Activation sent this deal back while the stage stays <span className="font-medium">Deal Closed</span>.
                  Open the Checklists tab, fix training, and save — your task will complete automatically.
                </p>
                {activationSentBackNote ? (
                  <p className="mt-2 rounded-md border border-amber-200 bg-white px-2 py-1.5 text-xs">
                    <span className="font-medium">Reason:</span> {activationSentBackNote}
                  </p>
                ) : null}
                <Button size="sm" className="mt-3" onClick={() => setTab("checklists")}>
                  Open training checklists
                </Button>
              </div>
            ) : null}

            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div className="flex min-w-max gap-2">
                {TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      tab === t
                        ? "border-brand bg-brand text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {TAB_LABEL[t]}
                    {t === "tasks" && rmActionableTasks.length > 0 ? (
                      <span className="ml-1 opacity-80">({rmActionableTasks.length})</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            {tab === "profile" && pipelineId ? (
              <MuaProfileDetailsTab pipelineId={pipelineId} onSaved={load} />
            ) : null}

            {tab === "overview" && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <ProfileStatCard
                    label="Days in stage"
                    value={data.pipeline.daysInStage ?? "—"}
                    alert={(data.pipeline.daysInStage ?? 0) > 7}
                  />
                  <ProfileStatCard
                    label="Days since contact"
                    value={data.pipeline.daysSinceLastContact ?? "—"}
                    alert={(data.pipeline.daysSinceLastContact ?? 0) > 5}
                    hint={
                      data.callSummary?.lastCallAt
                        ? `Last call ${new Date(data.callSummary.lastCallAt).toLocaleDateString("en-IN")}`
                        : undefined
                    }
                  />
                  <ProfileStatCard
                    label="Deal amount"
                    value={data.payment ? `₹${data.payment.amount}` : "—"}
                    hint={data.payment ? `${data.payment.paymentMode} · ${data.payment.paymentDate}` : undefined}
                  />
                  <ProfileStatCard
                    label="Calls"
                    value={data.callSummary?.totalCalls ?? 0}
                    hint={`${data.callSummary?.callyzerCalls ?? 0} synced · ${formatDuration(data.callSummary?.totalDurationSec)} talk time`}
                  />
                  <ProfileStatCard
                    label="Onboarding"
                    value={
                      data.onboarding?.checklist1Complete && data.onboarding?.checklist2Complete ? "Complete" : "In progress"
                    }
                  />
                  <ProfileStatCard
                    label="Training"
                    value={data.training?.complete ? "Complete" : "Pending"}
                  />
                </div>

                <ProfileSection title="Pipeline stage">
                  <PipelineStageTrack current={data.pipeline.stage} />
                  {data.pipeline.stage === "Onboarding" ? (
                    <p className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-950">
                      Complete onboarding checklists on the Checklists tab. The deal moves to Deal Closed automatically when training is finished.
                    </p>
                  ) : null}
                  {data.pipeline.stage === "Part Payment" && data.paymentSummary ? (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {paymentBalanceLabel(
                        Number(data.paymentSummary.quotedAmount ?? 0),
                        Number(data.paymentSummary.totalPaid ?? 0),
                      )}
                      {" — record the next payment via Change stage → Deal Closed."}
                    </p>
                  ) : null}
                  {data.pipeline.stage !== "Deal Closed" ? (
                    <p className="mt-3 text-xs text-slate-muted">
                      Stages can move forward or back. Plan/payment required for Details Shared, Confirm, and Deal Closed.
                    </p>
                  ) : activationSentBackActive ? (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Deal closed — stage stays locked. Fix activation issues on the Checklists tab (training only).
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-slate-muted">Deal closed — stage is locked.</p>
                  )}
                </ProfileSection>

                {comms.sales.length > 0 ? (
                  <ProfileSection
                    title="Recent activity"
                    action={
                      <button
                        type="button"
                        className="text-xs font-medium text-accent hover:underline"
                        onClick={() => setTab("ledger")}
                      >
                        All →
                      </button>
                    }
                  >
                    <div className="space-y-2">
                      {comms.sales.slice(0, 3).map((e: any) => (
                        <div key={e.id} className="flex gap-2 border-l-2 border-brand/30 pl-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-slate-muted">
                              {new Date(e.createdAt).toLocaleString("en-IN")}
                              {e.actorName ? ` · ${e.actorName}` : ""}
                            </p>
                            <p className="text-sm text-slate-700">{e.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ProfileSection>
                ) : null}

                <ProfileSection title="Log activity">
                  <LogEntryPanel
                    pipelineId={pipelineId!}
                    onSaved={load}
                    whatsApp={pipelineWhatsApp(data)}
                  />
                </ProfileSection>

                <ProfileCollapsibleSection
                  title="RM + commission track"
                  defaultOpen={comms.prior.length > 0}
                  badge={
                    comms.prior.length > 0 ? (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {comms.prior.length}
                      </span>
                    ) : null
                  }
                >
                  {comms.prior.length === 0 ? (
                    <p className="text-sm text-slate-muted">No RM/commission history yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {comms.prior.slice(0, 3).map((e: any) => (
                        <div key={e.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                          <p className="text-xs text-slate-muted">
                            {new Date(e.createdAt).toLocaleString("en-IN")}
                            {e.actorName ? ` · ${e.actorName}` : ""}
                          </p>
                          <p className="mt-0.5 text-sm text-slate-700">{e.description}</p>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-xs font-medium text-accent hover:underline"
                        onClick={() => setTab("ledger")}
                      >
                        View full history →
                      </button>
                    </div>
                  )}
                </ProfileCollapsibleSection>

                <ProfileCollapsibleSection
                  title="Previous plans"
                  defaultOpen={(data.planHistory?.length ?? 0) > 0}
                  badge={
                    (data.planHistory?.length ?? 0) > 0 ? (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {data.planHistory.length}
                      </span>
                    ) : null
                  }
                >
                  {Array.isArray(data.planHistory) && data.planHistory.length > 0 ? (
                    <div className="space-y-2">
                      {data.planHistory.map((h: any) => (
                        <div
                          key={h.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
                        >
                          <Badge>{h.planTier ? PLAN_TIER_LABELS[h.planTier as PlanTier] ?? h.planTier : "No Plan"}</Badge>
                          <span className="text-xs text-slate-muted">
                            {h.assignedAt ? new Date(h.assignedAt).toLocaleDateString("en-IN") : "—"}
                            {" → "}
                            {h.expiryAt ? new Date(h.expiryAt).toLocaleDateString("en-IN") : "—"}
                          </span>
                          {h.notes ? <p className="w-full text-xs text-slate-600">{h.notes}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-muted">No previous plan history.</p>
                  )}
                </ProfileCollapsibleSection>

                <ProfileCollapsibleSection title="AI sales assist" defaultOpen={false}>
                  <AIChatPanel presetPipelineId={pipelineId!} compact />
                </ProfileCollapsibleSection>
              </div>
            )}

            {tab === "stageLog" && (
              <div className="space-y-2">
                {(data.stageLog ?? []).length === 0 ? (
                  <ProfileEmptyState message="No stage changes logged yet." />
                ) : (
                  (data.stageLog ?? []).map((l: any) => (
                    <div key={l.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge>{l.fromStage ?? "—"} → {l.toStage}</Badge>
                        <span className="text-xs text-slate-muted">{new Date(l.createdAt).toLocaleString("en-IN")}</span>
                      </div>
                      <p className="text-xs text-slate-muted">{l.changedByName ?? "Unknown"}</p>
                      {l.nextTouchPoint ? (
                        <p className="text-xs text-slate-muted">
                          Next touch {new Date(l.nextTouchPoint).toLocaleDateString("en-IN")}
                        </p>
                      ) : null}
                      {l.note ? <p className="mt-1 text-sm text-slate-700">{l.note}</p> : null}
                      {formatStageLogPlanSummary(l.metadata) ? (
                        <p className="mt-1 text-sm font-medium text-emerald-800">
                          {formatStageLogPlanSummary(l.metadata)}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "tasks" && (
              <div className="space-y-2">
                {activationSentBackActive ? (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    <span className="font-semibold">Activation send-back task:</span> use Checklists → Training to fix
                    issues. The task completes when training is saved — no stage change needed.
                  </p>
                ) : null}
                {activationForwarded && !activationSentBackActive ? (
                  <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-950">
                    Onboarding is complete — this MUA has been forwarded to the activation team.
                  </p>
                ) : null}
                {rmActionableTasks.length === 0 ? (
                  <ProfileEmptyState message="No pending tasks for you on this pipeline." />
                ) : (
                  rmActionableTasks.map((t: any) => (
                    <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                      <p className="font-medium text-brand">{t.title}</p>
                      <p className="text-xs text-slate-muted">
                        {t.taskType}
                        {t.dueDate ? ` · due ${new Date(t.dueDate).toLocaleDateString("en-IN")}` : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "calls" && (
              <CallsTab
                calls={data.calls ?? []}
                onSuggestNotConnected={() => {
                  setStagePreset("Not Connected");
                  setStageOpen(true);
                }}
              />
            )}

            {tab === "checklists" && (
              <OnboardingChecklistFlow
                pipelineId={pipelineId!}
                onboarding={data.onboarding}
                training={data.training}
                activation={data.activation}
                artistCity={data.pipeline?.muaCity ?? undefined}
                artistRegions={artistRegions}
                pipelineStage={data.pipeline?.stage}
                onSaved={handlePipelineRefresh}
              />
            )}

            {tab === "ledger" && (
              <div className="space-y-3">
                <LogEntryPanel
                  pipelineId={pipelineId!}
                  onSaved={load}
                  whatsApp={pipelineWhatsApp(data)}
                />
                <CommsTimeline
                  sales={comms.sales}
                  prior={comms.prior}
                  canLoadMoreSales={Boolean((comms.page?.salesTotal ?? 0) > (comms.sales?.length ?? 0))}
                  canLoadMorePrior={Boolean((comms.page?.priorTotal ?? 0) > (comms.prior?.length ?? 0))}
                  onLoadMoreSales={() => {
                    const next = salesOffset + pageLimit;
                    setSalesOffset(next);
                    void load({ append: true, nextSalesOffset: next, nextPriorOffset: priorOffset });
                  }}
                  onLoadMorePrior={() => {
                    const next = priorOffset + pageLimit;
                    setPriorOffset(next);
                    void load({ append: true, nextSalesOffset: salesOffset, nextPriorOffset: next });
                  }}
                />
              </div>
            )}
          </div>
        )}
      </SlideOver>

      {pipelineId && data?.pipeline?.stage && (
        <StageChangePanel
          open={stageOpen}
          onClose={() => setStageOpen(false)}
          pipelineId={pipelineId}
          currentStage={data.pipeline.stage}
          prefill={stagePreset}
          onDone={(result) => {
            void handlePipelineRefresh();
            if (result?.toStage === "Onboarding") {
              setTab("checklists");
            }
          }}
        />
      )}
    </>
  );
}
