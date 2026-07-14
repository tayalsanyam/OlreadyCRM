"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  defaultOverviewDateRange,
  type OverviewDateRange,
} from "@/lib/admin-overview-date-range";

type Props = {
  values: OverviewDateRange;
  onChange: (next: OverviewDateRange) => void;
  onApply: () => void;
  onReset: () => void;
};

export function OverviewDateRangeFilter({ values, onChange, onApply, onReset }: Props) {
  const defaults = defaultOverviewDateRange();
  const dirty =
    values.dateFrom !== defaults.dateFrom || values.dateTo !== defaults.dateTo;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[10rem]">
        <label className="mb-1 block text-xs text-slate-muted">From</label>
        <Input
          type="date"
          value={values.dateFrom}
          onChange={(e) => onChange({ ...values, dateFrom: e.target.value })}
        />
      </div>
      <div className="min-w-[10rem]">
        <label className="mb-1 block text-xs text-slate-muted">To</label>
        <Input
          type="date"
          value={values.dateTo}
          onChange={(e) => onChange({ ...values, dateTo: e.target.value })}
        />
      </div>
      <Button variant="secondary" onClick={onApply}>
        Apply
      </Button>
      <Button variant="ghost" onClick={onReset} disabled={!dirty}>
        Reset to month
      </Button>
    </div>
  );
}
