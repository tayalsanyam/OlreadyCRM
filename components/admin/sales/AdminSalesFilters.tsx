"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PIPELINE_STAGE_ORDER } from "@/lib/types";

export type AdminSalesFilterValues = {
  dateFrom: string;
  dateTo: string;
  stage: string;
  muaType: string;
  source: string;
  city: string;
  assignedTo: string;
  teamId: string;
  q: string;
};

export const EMPTY_ADMIN_SALES_FILTERS: AdminSalesFilterValues = {
  dateFrom: "",
  dateTo: "",
  stage: "",
  muaType: "",
  source: "",
  city: "",
  assignedTo: "",
  teamId: "",
  q: "",
};

const SOURCE_OPTIONS = ["Inbound", "Ads", "Referral", "Instagram DM", "Others"];

type Props = {
  values: AdminSalesFilterValues;
  onChange: (next: AdminSalesFilterValues) => void;
  onApply: () => void;
  onReset: () => void;
  showDates?: boolean;
  showSearch?: boolean;
};

export function AdminSalesFilters({
  values,
  onChange,
  onApply,
  onReset,
  showDates = true,
  showSearch = true,
}: Props) {
  const [assignees, setAssignees] = useState<Array<{ id: string; name: string }>>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    void fetch("/api/admin/users")
      .then((r) => r.json())
      .then((j: { data?: Array<{ id: string; name: string; role: string }> }) => {
        const list = (j.data ?? []).filter((u) => u.role === "salesRm" || u.role === "salesTl");
        setAssignees(list.map((u) => ({ id: u.id, name: u.name })));
      });
    void fetch("/api/admin/sales/teams")
      .then((r) => r.json())
      .then((j: { data?: Array<{ id: string; name: string }> }) => setTeams(j.data ?? []));
    void fetch("/api/admin/cities")
      .then((r) => r.json())
      .then((j: { data?: Array<{ city: string }> }) => setCities((j.data ?? []).map((c) => c.city)));
  }, []);

  const set = (patch: Partial<AdminSalesFilterValues>) => onChange({ ...values, ...patch });

  return (
    <div className="space-y-2">
      {showDates ? (
        <div className="grid gap-2 md:grid-cols-4">
          <Input type="date" value={values.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} placeholder="From" />
          <Input type="date" value={values.dateTo} onChange={(e) => set({ dateTo: e.target.value })} placeholder="To" />
          {showSearch ? (
            <Input
              value={values.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Search MUA, city, salesperson"
            />
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button onClick={onApply}>Apply</Button>
            <Button variant="secondary" onClick={onReset}>
              Reset
            </Button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
        <Select
          label="Stage"
          value={values.stage}
          onChange={(e) => set({ stage: e.target.value })}
          options={[{ value: "", label: "All stages" }, ...PIPELINE_STAGE_ORDER.map((s) => ({ value: s, label: s }))]}
        />
        <Select
          label="MUA type"
          value={values.muaType}
          onChange={(e) => set({ muaType: e.target.value })}
          options={[
            { value: "", label: "All types" },
            { value: "candidate", label: "Potential" },
            { value: "renewal", label: "Renewal" },
            { value: "re_engage", label: "Win-back" },
          ]}
        />
        <Select
          label="Source"
          value={values.source}
          onChange={(e) => set({ source: e.target.value })}
          options={[{ value: "", label: "All sources" }, ...SOURCE_OPTIONS.map((s) => ({ value: s, label: s }))]}
        />
        <Select
          label="City"
          value={values.city}
          onChange={(e) => set({ city: e.target.value })}
          options={[{ value: "", label: "All cities" }, ...cities.map((c) => ({ value: c, label: c }))]}
        />
        <Select
          label="Salesperson"
          value={values.assignedTo}
          onChange={(e) => set({ assignedTo: e.target.value })}
          options={[
            { value: "", label: "All" },
            { value: "__unassigned__", label: "Unassigned only" },
            { value: "__assigned__", label: "Assigned" },
            ...assignees.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
        <Select
          label="Team"
          value={values.teamId}
          onChange={(e) => set({ teamId: e.target.value })}
          options={[{ value: "", label: "All teams" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
        />
      </div>
      {!showDates ? (
        <div className="flex flex-wrap items-end gap-2">
          {showSearch ? (
            <div className="min-w-[220px] flex-1">
              <Input
                value={values.q}
                onChange={(e) => set({ q: e.target.value })}
                placeholder="Search name or city"
              />
            </div>
          ) : null}
          <Button onClick={onApply}>Apply</Button>
          <Button variant="secondary" onClick={onReset}>
            Reset
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function buildAdminSalesQuery(
  values: AdminSalesFilterValues,
  extra?: Record<string, string>
): string {
  const qs = new URLSearchParams();
  if (values.dateFrom) qs.set("date_from", values.dateFrom);
  if (values.dateTo) qs.set("date_to", values.dateTo);
  if (values.stage) qs.set("stage", values.stage);
  if (values.muaType) qs.set("mua_type", values.muaType);
  if (values.source) qs.set("source", values.source);
  if (values.city) qs.set("city", values.city);
  if (values.assignedTo === "__unassigned__") qs.set("unassigned_only", "1");
  else if (values.assignedTo === "__assigned__") qs.set("assigned_only", "1");
  else if (values.assignedTo) qs.set("assigned_to", values.assignedTo);
  if (values.teamId) qs.set("team_id", values.teamId);
  if (values.q.trim()) qs.set("q", values.q.trim());
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) qs.set(k, v);
    }
  }
  return qs.toString();
}
