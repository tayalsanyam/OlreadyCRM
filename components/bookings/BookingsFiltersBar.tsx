"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { BookingsListFilters } from "@/lib/bookings-filters";
import {
  uniqueMuaOptions,
  uniquePlanOptions,
} from "@/lib/bookings-filters";
import { COMMISSION_PAYMENT_FILTER_LABELS } from "@/lib/commission-booking";
import type { CommissionPaymentFilter } from "@/lib/commission-booking";
import type { BookingRow } from "@/lib/types";
import { PLAN_TIER_LABELS } from "@/lib/types";

interface BookingsFiltersBarProps {
  bookings: BookingRow[];
  filters: BookingsListFilters;
  onChange: (next: BookingsListFilters) => void;
  filteredCount: number;
  showCommissionFilter?: boolean;
}

export function BookingsFiltersBar({
  bookings,
  filters,
  onChange,
  filteredCount,
  showCommissionFilter = false,
}: BookingsFiltersBarProps) {
  const muaOptions = useMemo(() => uniqueMuaOptions(bookings), [bookings]);
  const planOptions = useMemo(() => uniquePlanOptions(bookings), [bookings]);

  const hasFilters =
    filters.leadQuery.trim() !== "" ||
    filters.muaId !== "" ||
    filters.plan !== "" ||
    filters.commissionStatus !== "";

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm font-medium text-brand">Search & filter</p>
        <p className="text-xs text-slate-muted">
          Showing {filteredCount} of {bookings.length} bookings
        </p>
      </div>
      <div
        className={`grid gap-3 sm:grid-cols-2 ${showCommissionFilter ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
      >
        <Input
          label="Lead"
          placeholder="Bride name, ID, city…"
          value={filters.leadQuery}
          onChange={(e) =>
            onChange({ ...filters, leadQuery: e.target.value })
          }
        />
        <Select
          label="MUA"
          value={filters.muaId}
          onChange={(e) => onChange({ ...filters, muaId: e.target.value })}
          options={[
            { value: "", label: "All MUAs" },
            ...muaOptions.map((m) => ({ value: m.id, label: m.name })),
          ]}
        />
        <Select
          label="Plan"
          value={filters.plan}
          onChange={(e) =>
            onChange({
              ...filters,
              plan: e.target.value as BookingsListFilters["plan"],
            })
          }
          options={[
            { value: "", label: "All plans" },
            ...planOptions.map((p) => ({
              value: p,
              label: PLAN_TIER_LABELS[p],
            })),
          ]}
        />
        {showCommissionFilter && (
          <Select
            label="Commission"
            value={filters.commissionStatus}
            onChange={(e) =>
              onChange({
                ...filters,
                commissionStatus: e.target.value as CommissionPaymentFilter,
              })
            }
            options={(
              Object.keys(COMMISSION_PAYMENT_FILTER_LABELS) as CommissionPaymentFilter[]
            ).map((key) => ({
              value: key,
              label: COMMISSION_PAYMENT_FILTER_LABELS[key],
            }))}
          />
        )}
        <div className="flex items-end">
          <Button
            variant="ghost"
            size="sm"
            className="w-full sm:w-auto"
            disabled={!hasFilters}
            onClick={() =>
              onChange({
                leadQuery: "",
                muaId: "",
                plan: "",
                commissionStatus: "",
              })
            }
          >
            Clear filters
          </Button>
        </div>
      </div>
    </div>
  );
}
