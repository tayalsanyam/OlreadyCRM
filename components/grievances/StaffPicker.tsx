"use client";

import { useCallback, useEffect, useState } from "react";
import { Select } from "@/components/ui/Select";
import type { UserRole } from "@/lib/types";

type StaffOption = { id: string; name: string; role: UserRole };

type Props = {
  value: string;
  onChange: (staffId: string) => void;
  label?: string;
  roles?: UserRole[];
  allowUnassigned?: boolean;
  enabled?: boolean;
  emptyLabel?: string;
};

export function StaffPicker({
  value,
  onChange,
  label = "Assign to",
  roles,
  allowUnassigned = true,
  enabled = true,
  emptyLabel = "Unassigned",
}: Props) {
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    const params = roles?.length ? `?roles=${roles.join(",")}` : "";
    void fetch(`/api/crm/staff${params}`)
      .then(async (r) => {
        const json = (await r.json().catch(() => ({}))) as {
          data?: StaffOption[] | null;
          error?: string | null;
        };
        if (!r.ok) {
          throw new Error(json.error ?? "Failed to load staff");
        }
        setStaff(json.data ?? []);
      })
      .catch((err: unknown) => {
        setStaff([]);
        setError(err instanceof Error ? err.message : "Failed to load staff");
      })
      .finally(() => setLoading(false));
  }, [enabled, roles?.join(",")]);

  useEffect(() => {
    load();
  }, [load]);

  const placeholder = loading
    ? "Loading…"
    : error
      ? "Could not load — retry below"
      : staff.length === 0
        ? emptyLabel
        : emptyLabel;

  const staffOptions = staff.map((s) => ({
    value: s.id,
    label: `${s.name} (${s.role})`,
  }));

  const options = allowUnassigned
    ? [{ value: "", label: placeholder }, ...staffOptions]
    : staffOptions.length
      ? [{ value: "", label: emptyLabel, disabled: true }, ...staffOptions]
      : [{ value: "", label: placeholder, disabled: true }];

  return (
    <div className="space-y-1">
      <Select
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading || (staff.length === 0 && !error)}
        options={options}
      />
      {error && (
        <button type="button" className="text-xs text-accent hover:underline" onClick={load}>
          Retry loading staff
        </button>
      )}
      {!loading && !error && staff.length === 0 && (
        <p className="text-xs text-slate-muted">No active staff match this filter.</p>
      )}
    </div>
  );
}

export function AdminStaffPicker({
  value,
  onChange,
  label = "Loop in admin",
  enabled = true,
}: {
  value: string;
  onChange: (staffId: string) => void;
  label?: string;
  enabled?: boolean;
}) {
  return (
    <StaffPicker
      value={value}
      onChange={onChange}
      label={label}
      roles={["admin", "owner"]}
      allowUnassigned
      enabled={enabled}
      emptyLabel="Select admin…"
    />
  );
}
