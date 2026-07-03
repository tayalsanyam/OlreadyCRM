import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { TicketContext } from "@/lib/ticket-context";
import { ticketStatusLabel } from "@/lib/ticket-status";
import { formatDate } from "@/lib/utils";

function planSegmentLabel(mua: NonNullable<TicketContext["mua"]>): string {
  if (!mua.planTier && !mua.planTierName) return "Non-plan";
  if (mua.planExpiry && new Date(mua.planExpiry) < new Date()) return "Expired plan";
  return "Active plan";
}

type Props = {
  context: TicketContext | null;
  muaId: string | null;
  muaProfileHref?: string;
};

export function TicketCrmContextCard({ context, muaId, muaProfileHref }: Props) {
  const lead = context?.lead ?? null;

  return (
    <Card className="p-4">
      <h2 className="font-semibold text-brand">CRM context</h2>

      {lead && (
        <dl className="mt-3 space-y-3 rounded-lg border border-amber-100 bg-amber-50/50 p-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase text-amber-900">Bride / lead</dt>
            <dd className="mt-1 font-medium">
              <Link href={`/rm/leads/${lead.leadId}`} className="text-accent hover:underline">
                {lead.brideName}
              </Link>
              <span className="ml-2 font-normal text-slate-muted">({lead.displayId})</span>
            </dd>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-slate-muted">Phone</dt>
              <dd>{lead.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-muted">Region</dt>
              <dd className="capitalize">{lead.region ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-muted">Status</dt>
              <dd className="capitalize">{lead.status.replace(/_/g, " ")}</dd>
            </div>
            <div>
              <dt className="text-slate-muted">Event date</dt>
              <dd>{lead.eventDate ? formatDate(lead.eventDate) : "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-muted">Assigned RM</dt>
              <dd>{lead.assignedRmName ?? "—"}</dd>
            </div>
          </div>
          <p className="text-xs text-slate-muted">
            {lead.muasOffered} MUA(s) offered · {lead.openTicketCount} open bride ticket
            {lead.openTicketCount === 1 ? "" : "s"}
          </p>
        </dl>
      )}

      {!lead && !context?.mua && !muaId ? (
        <p className="mt-2 text-sm text-slate-muted">No bride or MUA linked — search above to link</p>
      ) : null}

      {context?.mua && muaId && (
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="text-slate-muted">MUA</dt>
            <dd>
              {muaProfileHref ? (
                <Link href={muaProfileHref} className="text-accent hover:underline">
                  {context.mua.name}
                </Link>
              ) : (
                context.mua.name
              )}
              {context.mua.city && (
                <span className="text-slate-muted"> · {context.mua.city}</span>
              )}
            </dd>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-slate-muted">Phone</dt>
              <dd>{context.mua.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-muted">WhatsApp</dt>
              <dd>{context.mua.whatsapp ?? context.mua.phone ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-muted">Email</dt>
              <dd>{context.mua.email ?? "—"}</dd>
            </div>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <dt className="text-xs font-medium uppercase text-slate-muted">Current plan</dt>
            <dd className="mt-1 space-y-1">
              <p>
                <span className="font-medium">
                  {context.mua.planTierName ?? context.mua.planTier ?? "No plan assigned"}
                </span>
                <span className="text-slate-muted"> · {planSegmentLabel(context.mua)}</span>
              </p>
              {context.mua.planExpiry && (
                <p className="text-slate-muted">
                  Expiry: {formatDate(context.mua.planExpiry)}
                </p>
              )}
              {(context.mua.weeklyCap != null ||
                context.mua.monthlyPushTarget != null ||
                context.mua.assuredBookings != null) && (
                <p className="text-slate-muted">
                  {context.mua.weeklyCap != null && `Weekly cap: ${context.mua.weeklyCap}`}
                  {context.mua.monthlyPushTarget != null &&
                    ` · Monthly target: ${context.mua.monthlyPushTarget}`}
                  {context.mua.assuredBookings != null &&
                    ` · Assured bookings: ${context.mua.assuredBookings}`}
                </p>
              )}
              {context.mua.assignedRmName && (
                <p className="text-slate-muted">Assigned RM: {context.mua.assignedRmName}</p>
              )}
            </dd>
          </div>

          {context.planDetails && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <dt className="text-xs font-medium uppercase text-slate-muted">
                Plan / deal details
              </dt>
              <dd className="mt-1 space-y-1">
                {context.planDetails.plan && (
                  <p>
                    Plan: <span className="font-medium">{context.planDetails.plan}</span>
                  </p>
                )}
                {context.planDetails.plansShared.length > 0 && (
                  <p className="text-slate-muted">
                    Shared:{" "}
                    {context.planDetails.plansShared
                      .map((p) => `${p.plan} (₹${p.amount})`)
                      .join(", ")}
                  </p>
                )}
                {(context.planDetails.leadCap != null || context.planDetails.leadBudget) && (
                  <p className="text-slate-muted">
                    {context.planDetails.leadCap != null &&
                      `Lead cap: ${context.planDetails.leadCap}`}
                    {context.planDetails.leadBudget &&
                      ` · Budget tier: ${context.planDetails.leadBudget}`}
                  </p>
                )}
                {(context.planDetails.durationStart || context.planDetails.durationEnd) && (
                  <p className="text-slate-muted">
                    Duration:{" "}
                    {context.planDetails.durationStart
                      ? formatDate(context.planDetails.durationStart)
                      : "—"}{" "}
                    →{" "}
                    {context.planDetails.durationEnd
                      ? formatDate(context.planDetails.durationEnd)
                      : "—"}
                  </p>
                )}
                {(context.planDetails.regions.length > 0 ||
                  context.planDetails.cities.length > 0) && (
                  <p className="text-slate-muted">
                    {context.planDetails.regions.length > 0 &&
                      `Regions: ${context.planDetails.regions.join(", ")}`}
                    {context.planDetails.cities.length > 0 &&
                      ` · Cities: ${context.planDetails.cities.slice(0, 5).join(", ")}${
                        context.planDetails.cities.length > 5 ? "…" : ""
                      }`}
                  </p>
                )}
                {context.planDetails.quotedAmount != null && (
                  <p className="text-slate-muted">
                    Quoted amount: ₹{context.planDetails.quotedAmount.toLocaleString("en-IN")}
                  </p>
                )}
                {context.planDetails.assuredBookings != null && (
                  <p className="text-slate-muted">
                    Assured bookings (deal): {context.planDetails.assuredBookings}
                  </p>
                )}
              </dd>
            </div>
          )}

          {context.pipeline && (
            <div>
              <dt className="text-slate-muted">Sales pipeline</dt>
              <dd>
                {context.pipeline.stage}
                {context.pipeline.muaType && (
                  <span className="text-slate-muted"> · {context.pipeline.muaType}</span>
                )}
                {context.pipeline.assignedToName && (
                  <span className="block text-slate-muted">
                    Sales RM: {context.pipeline.assignedToName}
                  </span>
                )}
              </dd>
            </div>
          )}

          {context.activation && (
            <div>
              <dt className="text-slate-muted">Activation</dt>
              <dd>
                Invoice: {context.activation.invoiceGenerated ? "yes" : "no"} · Contract:{" "}
                {context.activation.contractGenerated ? "yes" : "no"}
              </dd>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-muted">
            <span>Open tickets: {context.openTicketCount}</span>
            <span>Recent pushes: {context.recentPushes.length}</span>
          </div>

          {context.muaTicketHistory.length > 0 && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <dt className="text-xs font-medium uppercase text-slate-muted">
                MUA ticket history
              </dt>
              <dd className="mt-2">
                <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                  {context.muaTicketHistory.map((t) => {
                    const isClosed = t.status === "closed";
                    return (
                      <li
                        key={t.id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1.5 ${
                          t.isCurrent ? "border-accent/30 bg-white" : "border-slate-100 bg-white/80"
                        }`}
                      >
                        <div className="min-w-0">
                          {t.isCurrent ? (
                            <span className="font-medium">{t.ticketNumber}</span>
                          ) : (
                            <Link
                              href={`/care/grievances/${t.id}`}
                              className="font-medium text-accent hover:underline"
                            >
                              {t.ticketNumber}
                            </Link>
                          )}
                          <span className="ml-2 text-xs text-slate-muted">
                            {t.category.replace(/_/g, " ")}
                          </span>
                          {t.isCurrent && (
                            <Badge variant="muted" className="ml-2">
                              This ticket
                            </Badge>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant={isClosed ? "muted" : "success"}>
                            {isClosed ? "Closed" : ticketStatusLabel(t.status)}
                          </Badge>
                          <span className="text-xs text-slate-muted">
                            {formatDate(t.createdAt)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}
    </Card>
  );
}
