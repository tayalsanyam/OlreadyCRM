"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/Select";
import { mapAssignableStaffFromApi } from "@/lib/sales-pipeline-assignee";
import { PIPELINE_STAGE_ORDER, type CityRegion } from "@/lib/types";

type Props = {
  salesRmStaffId: string;
  teamId: string;
  state: string;
  pipelineStage: string;
  onSalesRmStaffIdChange: (v: string) => void;
  onTeamIdChange: (v: string) => void;
  onStateChange: (v: string) => void;
  onPipelineStageChange: (v: string) => void;
};

export function AdminMuasSalesFilters({
  salesRmStaffId,
  teamId,
  state,
  pipelineStage,
  onSalesRmStaffIdChange,
  onTeamIdChange,
  onStateChange,
  onPipelineStageChange,
}: Props) {
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [states, setStates] = useState<string[]>([]);

  useEffect(() => {
    void fetch("/api/sales/assignable-rms")
      .then((r) => r.json())
      .then((json: { data?: Array<{ id: string; name: string; role: string }> }) => {
        setStaff(mapAssignableStaffFromApi(json.data ?? []));
      });
    void fetch("/api/admin/sales/teams")
      .then((r) => r.json())
      .then((json: { data?: Array<{ id: string; name: string }> }) => setTeams(json.data ?? []));
    void fetch("/api/cities")
      .then((r) => r.json())
      .then((json: { data?: CityRegion[] }) => {
        const set = new Set<string>();
        for (const row of json.data ?? []) {
          if (row.state?.trim()) set.add(row.state.trim());
        }
        setStates([...set].sort((a, b) => a.localeCompare(b)));
      });
  }, []);

  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
      <Select
        label="Sales RM / TL"
        value={salesRmStaffId}
        onChange={(e) => onSalesRmStaffIdChange(e.target.value)}
        options={[
          { value: "", label: "Any salesperson" },
          ...staff.map((s) => ({ value: s.id, label: s.name })),
        ]}
      />
      <Select
        label="Pipeline stage"
        value={pipelineStage}
        onChange={(e) => onPipelineStageChange(e.target.value)}
        options={[
          { value: "", label: "All stages" },
          ...PIPELINE_STAGE_ORDER.map((s) => ({ value: s, label: s })),
        ]}
      />
      <Select
        label="Sales team"
        value={teamId}
        onChange={(e) => onTeamIdChange(e.target.value)}
        options={[
          { value: "", label: "All teams" },
          ...teams.map((t) => ({ value: t.id, label: t.name })),
        ]}
      />
      <Select
        label="State"
        value={state}
        onChange={(e) => onStateChange(e.target.value)}
        options={[
          { value: "", label: "All states" },
          ...states.map((s) => ({ value: s, label: s })),
        ]}
      />
    </div>
  );
}
