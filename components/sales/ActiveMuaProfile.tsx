"use client";

import { SlideOver } from "@/components/ui/SlideOver";
import { ProfileField, ProfileFieldGrid, ProfileSection, ProfileAvatar } from "@/components/sales/ProfileFieldGrid";

export function ActiveMuaProfile({ open, onClose, row }: { open: boolean; onClose: () => void; row: any }) {
  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-IN") : null;
  const fmtDateTime = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleString("en-IN") : null;

  return (
    <SlideOver open={open} onClose={onClose} title={row ? `Active MUA — ${row.name}` : "Active MUA"}>
      {!row ? null : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
            <ProfileAvatar name={row.name} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {row.planTier ? (
                  <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
                    {row.planTier}
                  </span>
                ) : null}
                {row.city ? <span className="text-sm text-slate-muted">{row.city}</span> : null}
              </div>
              <p className="text-lg font-semibold text-brand">{row.name}</p>
            </div>
          </div>

          <ProfileSection title="Account">
            <ProfileFieldGrid cols={3}>
              <ProfileField label="Plan expiry" value={fmtDate(row.planExpiry)} />
              <ProfileField label="Assigned RM" value={row.assignedRmName} />
              <ProfileField label="Closed by" value={row.salesClosedByName} />
            </ProfileFieldGrid>
          </ProfileSection>

          <ProfileSection title="Sales history">
            <ProfileFieldGrid>
              <ProfileField label="Closed at" value={fmtDateTime(row.salesClosedAt)} />
              <ProfileField
                label="Deal amount"
                value={
                  typeof row.dealAmount === "number"
                    ? `₹${row.dealAmount.toLocaleString("en-IN")}`
                    : null
                }
              />
              <ProfileField label="Pipeline ref" value={row.pipelineId} className="sm:col-span-2" />
            </ProfileFieldGrid>
          </ProfileSection>

          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-muted">
            Active in RM portal. Admin is notified to assign RM on activation. Expired plans re-enter sales pipeline.
          </p>
        </div>
      )}
    </SlideOver>
  );
}
