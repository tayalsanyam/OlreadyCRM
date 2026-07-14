"use client";

import { Input } from "@/components/ui/Input";
import type { LeadRouting } from "@/lib/lead-verify-routing";

export type { LeadRouting };

interface PortalRoutingFieldsProps {
  routing: LeadRouting;
  onRoutingChange: (r: LeadRouting) => void;
  portalCap: number | null;
  onPortalCapChange: (cap: number | null) => void;
  commissionRmId?: string;
  onCommissionRmIdChange?: (id: string) => void;
  commissionRms?: { id: string; name: string }[];
}

export function PortalRoutingFields({
  routing,
  onRoutingChange,
  portalCap,
  onPortalCapChange,
  commissionRmId = "",
  onCommissionRmIdChange,
  commissionRms = [],
}: PortalRoutingFieldsProps) {
  return (
    <div className="mb-6 space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-sm font-medium text-brand">Lead routing</p>
      <div className="space-y-2">
        {(
          [
            ["rm", "Assign to RM", "Verified lead goes to RM queue (normal flow)"],
            ["portal", "Portal only", "Listed on olready.in only, no RM assignment"],
            ["both", "Both", "On portal and assigned to RM"],
            ["commission", "Commission", "Assign to a Commission RM queue"],
          ] as const
        ).map(([value, label, hint]) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-transparent px-2 py-1.5 hover:bg-white"
          >
            <input
              type="radio"
              name="lead-routing"
              checked={routing === value}
              onChange={() => onRoutingChange(value)}
              className="mt-1"
            />
            <span>
              <span className="text-sm font-medium text-text">{label}</span>
              <span className="block text-xs text-slate-muted">{hint}</span>
            </span>
          </label>
        ))}
      </div>
      {(routing === "portal" || routing === "both") && (
        <div>
          <Input
            label="Portal cap"
            type="number"
            value={portalCap ?? ""}
            onChange={(e) =>
              onPortalCapChange(
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
          />
          <p className="mt-1 text-xs text-slate-muted">
            Max MUAs via portal (leave blank = no limit)
          </p>
        </div>
      )}
      {routing === "commission" && onCommissionRmIdChange ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-text">Commission RM *</span>
          <select
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={commissionRmId}
            onChange={(e) => onCommissionRmIdChange(e.target.value)}
          >
            <option value="">Select Commission RM</option>
            {commissionRms.map((rm) => (
              <option key={rm.id} value={rm.id}>
                {rm.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
