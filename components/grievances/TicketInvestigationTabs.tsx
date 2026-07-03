"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn, formatDate } from "@/lib/utils";
import type {
  InvestigationBooking,
  InvestigationLedgerEntry,
  InvestigationPush,
  TicketInvestigation,
} from "@/lib/ticket-investigation";

type TabId = "bride" | "sales" | "rm" | "commission" | "ledger";

const BASE_TABS: { id: TabId; label: string }[] = [
  { id: "sales", label: "Sales" },
  { id: "rm", label: "RM" },
  { id: "commission", label: "Commission" },
  { id: "ledger", label: "All ledger" },
];

const SOURCE_BADGE: Record<InvestigationLedgerEntry["source"], { label: string; variant: "muted" | "hot" | "critical" }> = {
  sales: { label: "Sales", variant: "muted" },
  rm: { label: "RM", variant: "muted" },
  commission: { label: "Commission", variant: "hot" },
  care: { label: "Care", variant: "critical" },
};

function LedgerList({ entries, emptyLabel }: { entries: InvestigationLedgerEntry[]; emptyLabel: string }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-muted">{emptyLabel}</p>;
  }
  return (
    <div className="max-h-[28rem] space-y-2 overflow-y-auto">
      {entries.map((e) => {
        const badge = SOURCE_BADGE[e.source];
        return (
          <div key={e.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-muted">
              <Badge variant={badge.variant}>{badge.label}</Badge>
              <span>{formatDate(e.createdAt)}</span>
              {e.actorName && <span>by {e.actorName}</span>}
              {e.leadDisplayId && (
                <span>
                  {e.leadDisplayId}
                  {e.leadName ? ` · ${e.leadName}` : ""}
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap">{e.description}</p>
          </div>
        );
      })}
    </div>
  );
}

function PushList({ pushes }: { pushes: InvestigationPush[] }) {
  if (pushes.length === 0) {
    return <p className="text-sm text-slate-muted">No pushes in this phase</p>;
  }
  return (
    <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
      {pushes.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 p-2">
          <div>
            <span className="font-medium">{p.leadDisplayId}</span> — {p.brideName}
            {p.rmName && <span className="ml-1 text-xs text-slate-muted">({p.rmName})</span>}
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant="muted">{p.stage.replace(/_/g, " ")}</Badge>
            <Badge variant="muted">{p.status}</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

function BookingList({ bookings }: { bookings: InvestigationBooking[] }) {
  if (bookings.length === 0) {
    return <p className="text-sm text-slate-muted">No bookings</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {bookings.map((b) => (
        <li key={b.id}>
          <span className="font-medium text-brand">{b.leadDisplayId}</span> — {b.brideName}: Rs.{" "}
          {b.bookedPrice.toLocaleString("en-IN")}
          {b.advancePaid != null && (
            <span className="text-slate-muted"> · Adv Rs. {b.advancePaid.toLocaleString("en-IN")}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function SalesPanel({ data }: { data: TicketInvestigation["sales"] }) {
  const { pipeline, onboarding, training, activation, comms } = data;
  if (!pipeline) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-muted">No active sales pipeline for this MUA.</p>
        {comms.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-brand">Sales comms history</h3>
            <LedgerList entries={comms} emptyLabel="No sales comms" />
          </>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-muted">Stage</dt>
          <dd className="font-medium capitalize">{pipeline.stage.replace(/_/g, " ")}</dd>
        </div>
        <div>
          <dt className="text-slate-muted">MUA type</dt>
          <dd>{pipeline.muaType ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-muted">Assigned to</dt>
          <dd>{pipeline.assignedToName ?? "Unassigned"}</dd>
        </div>
        <div>
          <dt className="text-slate-muted">Days in stage</dt>
          <dd>{pipeline.daysInStage ?? "—"}</dd>
        </div>
        {pipeline.salesClosedByName && (
          <div>
            <dt className="text-slate-muted">Closed by</dt>
            <dd>{pipeline.salesClosedByName}</dd>
          </div>
        )}
      </dl>

      {(onboarding || training || activation) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {onboarding && (
            <div className="rounded-lg border border-slate-100 p-3 text-sm">
              <p className="font-medium text-brand">Onboarding</p>
              <p className="mt-1 text-slate-muted">
                Checklist 1: {onboarding.checklist1Complete ? "done" : "pending"} · Checklist 2:{" "}
                {onboarding.checklist2Complete ? "done" : "pending"}
              </p>
              {onboarding.businessName && <p>{onboarding.businessName}</p>}
              {onboarding.plan && <p className="text-xs text-slate-muted">Plan: {onboarding.plan}</p>}
            </div>
          )}
          {training && (
            <div className="rounded-lg border border-slate-100 p-3 text-sm">
              <p className="font-medium text-brand">Training</p>
              <p className="mt-1">{training.complete ? "Complete" : "In progress"}</p>
              {training.profileLink && (
                <p className="truncate text-xs text-accent">{training.profileLink}</p>
              )}
            </div>
          )}
          {activation && (
            <div className="rounded-lg border border-slate-100 p-3 text-sm">
              <p className="font-medium text-brand">Activation</p>
              <p className="mt-1 text-slate-muted">
                Profile verified: {activation.profileLinkVerified ? "yes" : "no"} · Invoice:{" "}
                {activation.invoiceGenerated ? "yes" : "no"} · Contract:{" "}
                {activation.contractGenerated ? "yes" : "no"}
              </p>
              {activation.activatedAt && (
                <p className="text-xs">Activated {formatDate(activation.activatedAt)}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand">Sales communications</h3>
        <LedgerList entries={comms} emptyLabel="No sales comms logged" />
      </div>
    </div>
  );
}

function RmPanel({ data, mua }: { data: TicketInvestigation["rm"]; mua: TicketInvestigation["mua"] }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-muted">Assigned RM</dt>
          <dd className="font-medium">{data.assignedRmName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-muted">RM-phase pushes</dt>
          <dd>{data.stats.pushes}</dd>
        </div>
        <div>
          <dt className="text-slate-muted">Total bookings (MUA)</dt>
          <dd>{mua?.totalBookings ?? 0}</dd>
        </div>
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand">Plan MUA pushes (RM phase)</h3>
        <PushList pushes={data.pushes} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand">RM ledger</h3>
        <LedgerList entries={data.comms} emptyLabel="No RM ledger entries" />
      </div>
    </div>
  );
}

function CommissionPanel({ data }: { data: TicketInvestigation["commission"] }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-muted">Commission pushes</dt>
          <dd>{data.stats.pushes}</dd>
        </div>
        <div>
          <dt className="text-slate-muted">Bookings</dt>
          <dd>{data.stats.bookings}</dd>
        </div>
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand">Commission pushes</h3>
        <PushList pushes={data.pushes} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand">Bookings</h3>
        <BookingList bookings={data.bookings} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand">Commission ledger</h3>
        <LedgerList entries={data.comms} emptyLabel="No commission ledger entries" />
      </div>
    </div>
  );
}

function BridePanel({ data }: { data: NonNullable<TicketInvestigation["bride"]> }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-muted">Lead</dt>
          <dd className="font-medium">
            {data.brideName} ({data.displayId})
          </dd>
        </div>
        <div>
          <dt className="text-slate-muted">Status</dt>
          <dd className="capitalize">{data.status.replace(/_/g, " ")}</dd>
        </div>
        <div>
          <dt className="text-slate-muted">RM</dt>
          <dd>{data.assignedRmName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-muted">Phone</dt>
          <dd>{data.phone ?? "—"}</dd>
        </div>
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand">Artist pushes on this lead</h3>
        {data.pushes.length === 0 ? (
          <p className="text-sm text-slate-muted">No pushes logged</p>
        ) : (
          <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
            {data.pushes.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 rounded border border-slate-100 p-2">
                <span className="font-medium">{p.muaName}</span>
                <span className="text-xs text-slate-muted">
                  {p.stage.replace(/_/g, " ")} · {p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand">Bride journey &amp; comms</h3>
        <LedgerList entries={data.comms} emptyLabel="No RM comms on this lead yet" />
      </div>
    </div>
  );
}

export function TicketInvestigationTabs({
  ticketId,
  muaId,
  leadId,
  raisedByType,
}: {
  ticketId: string;
  muaId: string | null;
  leadId?: string | null;
  raisedByType?: string;
}) {
  const showBrideTab = raisedByType === "bride" && Boolean(leadId);
  const tabs = showBrideTab
    ? [{ id: "bride" as const, label: "Bride journey" }, ...BASE_TABS]
    : BASE_TABS;

  const [tab, setTab] = useState<TabId>(showBrideTab ? "bride" : "ledger");
  const [loading, setLoading] = useState(false);
  const [investigation, setInvestigation] = useState<TicketInvestigation | null>(null);

  const load = useCallback(() => {
    if (!muaId && !leadId) {
      setInvestigation(null);
      return;
    }
    setLoading(true);
    void fetch(`/api/crm/tickets/${ticketId}/investigation`)
      .then((r) => r.json())
      .then((json) => {
        setInvestigation(json.data?.investigation ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ticketId, muaId, leadId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!muaId && !leadId) {
    return (
      <Card className="p-4">
        <h2 className="font-semibold text-brand">Investigation</h2>
        <p className="mt-2 text-sm text-slate-muted">
          Link a lead or MUA to view bride journey, Sales, RM, Commission history and communications.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-brand">Investigation</h2>
          {investigation?.mua && (
            <p className="mt-1 text-sm text-slate-muted">
              {investigation.mua.name}
              {investigation.mua.planTier ? ` · ${investigation.mua.planTier}` : ""}
              {" · "}
              {investigation.mua.totalPushes} pushes · {investigation.mua.activePushes} active ·{" "}
              {investigation.mua.totalBookings} bookings
            </p>
          )}
        </div>
        <button
          type="button"
          className="text-xs font-medium text-accent hover:underline"
          onClick={load}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-100 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-brand text-white"
                : "text-slate-muted hover:bg-slate-100 hover:text-text"
            )}
          >
            {t.label}
            {t.id === "ledger" && investigation?.ledger.length ? (
              <span className="ml-1 opacity-80">({investigation.ledger.length})</span>
            ) : null}
          </button>
        ))}
      </div>

      {loading && !investigation ? (
        <p className="text-sm text-slate-muted">Loading investigation data…</p>
      ) : !investigation ? (
        <p className="text-sm text-slate-muted">Could not load investigation data.</p>
      ) : (
        <>
          {tab === "bride" && investigation.bride && <BridePanel data={investigation.bride} />}
          {tab === "sales" && <SalesPanel data={investigation.sales} />}
          {tab === "rm" && <RmPanel data={investigation.rm} mua={investigation.mua} />}
          {tab === "commission" && <CommissionPanel data={investigation.commission} />}
          {tab === "ledger" && (
            <LedgerList entries={investigation.ledger} emptyLabel="No ledger entries yet" />
          )}
        </>
      )}
    </Card>
  );
}
