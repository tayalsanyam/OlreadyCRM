"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AdminExportCsvButton } from "@/components/admin/AdminExportCsvButton";
import { PLAN_TIER_LABELS, type PlanTier } from "@/lib/types";
import { cn } from "@/lib/utils";

type Row = {
  userId: string;
  name: string;
  role: string;
  teamId: string | null;
  teamName: string | null;
  targetRevenue?: number | null;
  targetPotentialCalls?: number | null;
  targetPotentialSold?: number | null;
  targetExistingCalls?: number | null;
  targetExistingSold?: number | null;
  minCallsPerDay?: number | null;
  minTalkTimeMinPerDay?: number | null;
  planTargets?: Record<string, number | null> | null;
};

type SalesTeam = {
  id: string;
  name: string;
  memberCount?: number;
};

type TeamTab = "all" | "unassigned" | string;

const PLAN_TIERS: PlanTier[] = ["highestPrivy", "phoenix2", "phoenix", "pro", "prime"];

const ROLE_LABEL: Record<string, string> = {
  sales_rm: "Sales RM",
  sales_tl: "Team lead",
};

function cloneRow(row: Row): Row {
  return {
    ...row,
    planTargets: row.planTargets ? { ...row.planTargets } : {},
  };
}

function sanitizeDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

function numInputValue(value: number | null | undefined): string {
  return value == null ? "" : String(Math.trunc(value));
}

function parseNumInput(value: string): number | null {
  const digits = sanitizeDigitsOnly(value);
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

const NUMERIC_INPUT_KEYS = new Set([
  "Backspace",
  "Delete",
  "Tab",
  "Escape",
  "Enter",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

function TargetNumInput({
  value,
  onChange,
  className,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  className?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      className={className}
      value={numInputValue(value)}
      onKeyDown={(e) => {
        if (e.ctrlKey || e.metaKey) return;
        if (NUMERIC_INPUT_KEYS.has(e.key)) return;
        if (/^\d$/.test(e.key)) return;
        e.preventDefault();
      }}
      onPaste={(e) => {
        e.preventDefault();
        const pasted = sanitizeDigitsOnly(e.clipboardData.getData("text"));
        if (!pasted) return;
        const input = e.currentTarget;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        const merged = sanitizeDigitsOnly(input.value.slice(0, start) + pasted + input.value.slice(end));
        onChange(parseNumInput(merged));
      }}
      onChange={(e) => onChange(parseNumInput(e.target.value))}
    />
  );
}

function rowsEqual(a: Row, b: Row): boolean {
  if (
    a.targetRevenue !== b.targetRevenue ||
    a.targetPotentialCalls !== b.targetPotentialCalls ||
    a.targetPotentialSold !== b.targetPotentialSold ||
    a.targetExistingCalls !== b.targetExistingCalls ||
    a.targetExistingSold !== b.targetExistingSold ||
    a.minCallsPerDay !== b.minCallsPerDay ||
    a.minTalkTimeMinPerDay !== b.minTalkTimeMinPerDay
  ) {
    return false;
  }
  for (const tier of PLAN_TIERS) {
    if ((a.planTargets?.[tier] ?? null) !== (b.planTargets?.[tier] ?? null)) return false;
  }
  return true;
}

function buildSaveBody(row: Row) {
  const planTargets: Record<string, number | null> = {};
  for (const tier of PLAN_TIERS) {
    planTargets[tier] = row.planTargets?.[tier] ?? null;
  }
  return {
    targetRevenue: row.targetRevenue ?? null,
    targetPotentialCalls: row.targetPotentialCalls ?? null,
    targetPotentialSold: row.targetPotentialSold ?? null,
    targetExistingCalls: row.targetExistingCalls ?? null,
    targetExistingSold: row.targetExistingSold ?? null,
    minCallsPerDay: row.minCallsPerDay ?? null,
    minTalkTimeMinPerDay: row.minTalkTimeMinPerDay ?? null,
    planTargets,
  };
}

export default function SalesTargetsPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [savedRows, setSavedRows] = useState<Row[]>([]);
  const [draftRows, setDraftRows] = useState<Record<string, Row>>({});
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [teamTab, setTeamTab] = useState<TeamTab>("all");
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [savedAtMap, setSavedAtMap] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [defaultCalls, setDefaultCalls] = useState("20");
  const [defaultTalkMins, setDefaultTalkMins] = useState("45");

  const syncDrafts = useCallback((rows: Row[]) => {
    const next: Record<string, Row> = {};
    for (const row of rows) next[row.userId] = cloneRow(row);
    setDraftRows(next);
  }, []);

  const load = useCallback(
    async (m = month) => {
      const res = await fetch(`/api/admin/sales/targets?month=${m}`);
      const json = await res.json();
      const rows = (json.data?.rows ?? []) as Row[];
      setSavedRows(rows);
      syncDrafts(rows);
      setSavedAtMap({});
      setSaveError(null);
    },
    [month, syncDrafts],
  );

  useEffect(() => {
    void load();
    void fetch("/api/admin/sales/teams")
      .then((r) => r.json())
      .then((j: { data?: SalesTeam[] }) => setTeams(j.data ?? []));
  }, [load]);

  const teamCounts = useMemo(() => {
    const byTeam = new Map<string, number>();
    let unassigned = 0;
    for (const row of savedRows) {
      if (!row.teamId) {
        unassigned += 1;
        continue;
      }
      byTeam.set(row.teamId, (byTeam.get(row.teamId) ?? 0) + 1);
    }
    return { byTeam, unassigned, total: savedRows.length };
  }, [savedRows]);

  const filteredRows = useMemo(() => {
    if (teamTab === "all") return savedRows;
    if (teamTab === "unassigned") return savedRows.filter((r) => !r.teamId);
    return savedRows.filter((r) => r.teamId === teamTab);
  }, [savedRows, teamTab]);

  const dirtyUserIds = useMemo(() => {
    const ids: string[] = [];
    for (const row of savedRows) {
      const draft = draftRows[row.userId];
      if (draft && !rowsEqual(row, draft)) ids.push(row.userId);
    }
    return ids;
  }, [savedRows, draftRows]);

  const dirtyInView = useMemo(
    () => filteredRows.filter((r) => dirtyUserIds.includes(r.userId)),
    [filteredRows, dirtyUserIds],
  );

  const exportQuery = useMemo(() => {
    const qs = new URLSearchParams({ month });
    if (teamTab !== "all") qs.set("team_id", teamTab);
    return qs.toString();
  }, [month, teamTab]);

  function updateDraft(userId: string, patch: Partial<Row>) {
    setDraftRows((prev) => ({
      ...prev,
      [userId]: { ...cloneRow(prev[userId] ?? savedRows.find((r) => r.userId === userId)!), ...patch },
    }));
  }

  function updatePlanDraft(userId: string, tier: PlanTier, value: string) {
    setDraftRows((prev) => {
      const base = cloneRow(prev[userId] ?? savedRows.find((r) => r.userId === userId)!);
      base.planTargets = { ...(base.planTargets ?? {}), [tier]: parseNumInput(value) };
      return { ...prev, [userId]: base };
    });
  }

  async function saveRow(userId: string) {
    const draft = draftRows[userId];
    if (!draft) return;
    setSavingMap((p) => ({ ...p, [userId]: true }));
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/sales/targets/${userId}?month=${month}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSaveBody(draft)),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error ?? `Save failed (${res.status})`);
      }
      const saved = cloneRow(draft);
      setSavedRows((prev) => prev.map((r) => (r.userId === userId ? saved : r)));
      setDraftRows((prev) => ({ ...prev, [userId]: saved }));
      setSavedAtMap((p) => ({ ...p, [userId]: new Date().toLocaleTimeString("en-IN") }));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save targets");
    } finally {
      setSavingMap((p) => ({ ...p, [userId]: false }));
    }
  }

  async function saveAllDirty(scope: "view" | "all" = "view") {
    const ids = scope === "all" ? dirtyUserIds : dirtyInView.map((r) => r.userId);
    for (const userId of ids) {
      await saveRow(userId);
    }
  }

  async function copyPreviousMonth() {
    await fetch("/api/admin/sales/targets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "copyPreviousMonth", month }),
    });
    await load(month);
  }

  async function applyDefaults() {
    await fetch("/api/admin/sales/targets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "setDefaults",
        month,
        minCallsPerDay: defaultCalls.trim() ? Number(defaultCalls) : null,
        minTalkTimeMinPerDay: defaultTalkMins.trim() ? Number(defaultTalkMins) : null,
      }),
    });
    await load(month);
  }

  const planColumns = useMemo(() => PLAN_TIERS, []);
  const showTeamColumn = teamTab === "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-brand">Sales Targets</h1>
        <Input
          type="month"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            void load(e.target.value);
          }}
        />
        <AdminExportCsvButton apiPath="/api/admin/sales/targets" query={exportQuery} />
        <Button variant="secondary" onClick={() => load()}>
          Refresh
        </Button>
        <Button variant="secondary" onClick={copyPreviousMonth}>
          Copy Previous Month
        </Button>
        {dirtyInView.length > 0 ? (
          <Button onClick={() => void saveAllDirty("view")}>
            Save changes ({dirtyInView.length})
          </Button>
        ) : null}
        {dirtyUserIds.length > dirtyInView.length ? (
          <Button variant="secondary" onClick={() => void saveAllDirty("all")}>
            Save all unsaved ({dirtyUserIds.length})
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-slate-muted">
        Edit targets below, then click <strong>Save</strong> on each row or use <strong>Save changes</strong> for the
        current team view. Nothing is written until you save.
      </p>

      {saveError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{saveError}</div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTeamTab("all")}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-medium",
            teamTab === "all" ? "bg-brand text-white" : "bg-slate-100 text-slate-muted hover:bg-slate-200",
          )}
        >
          All ({teamCounts.total})
        </button>
        {teams.map((t) => {
          const count = teamCounts.byTeam.get(t.id) ?? 0;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTeamTab(t.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium",
                teamTab === t.id ? "bg-brand text-white" : "bg-slate-100 text-slate-muted hover:bg-slate-200",
              )}
            >
              {t.name} ({count})
            </button>
          );
        })}
        {teamCounts.unassigned > 0 ? (
          <button
            type="button"
            onClick={() => setTeamTab("unassigned")}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              teamTab === "unassigned"
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-muted hover:bg-slate-200",
            )}
          >
            No team ({teamCounts.unassigned})
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3">
        <Input
          label="Default min calls/day"
          value={defaultCalls}
          inputMode="numeric"
          pattern="[0-9]*"
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey) return;
            if (NUMERIC_INPUT_KEYS.has(e.key)) return;
            if (/^\d$/.test(e.key)) return;
            e.preventDefault();
          }}
          onChange={(e) => setDefaultCalls(sanitizeDigitsOnly(e.target.value))}
        />
        <Input
          label="Default min talk mins/day"
          value={defaultTalkMins}
          inputMode="numeric"
          pattern="[0-9]*"
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey) return;
            if (NUMERIC_INPUT_KEYS.has(e.key)) return;
            if (/^\d$/.test(e.key)) return;
            e.preventDefault();
          }}
          onChange={(e) => setDefaultTalkMins(sanitizeDigitsOnly(e.target.value))}
        />
        <Button onClick={applyDefaults}>Set Defaults</Button>
      </div>

      {filteredRows.length === 0 ? (
        <p className="text-sm text-slate-muted">No sales staff in this team view.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                {showTeamColumn ? <TH>Team</TH> : null}
                <TH>Role</TH>
                <TH>Target Revenue</TH>
                <TH>Potential Calls</TH>
                <TH>Potential Sold</TH>
                <TH>Existing Calls</TH>
                <TH>Existing Sold</TH>
                <TH>Min Calls/Day</TH>
                <TH>Min Talk (min/day)</TH>
                {planColumns.map((tier) => (
                  <TH key={tier}>{PLAN_TIER_LABELS[tier]} plan target</TH>
                ))}
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filteredRows.map((saved) => {
                const draft = draftRows[saved.userId] ?? saved;
                const dirty = !rowsEqual(saved, draft);
                const saving = savingMap[saved.userId];
                return (
                  <TR key={saved.userId} className={dirty ? "bg-amber-50/60" : undefined}>
                    <TD className="font-medium">{saved.name}</TD>
                    {showTeamColumn ? (
                      <TD className="text-sm text-slate-muted">{saved.teamName ?? "—"}</TD>
                    ) : null}
                    <TD>{ROLE_LABEL[saved.role] ?? saved.role}</TD>
                    <TD>
                      <TargetNumInput
                        className="w-28 rounded border px-2 py-1 text-xs"
                        value={draft.targetRevenue}
                        onChange={(targetRevenue) => updateDraft(saved.userId, { targetRevenue })}
                      />
                    </TD>
                    <TD>
                      <TargetNumInput
                        className="w-20 rounded border px-2 py-1 text-xs"
                        value={draft.targetPotentialCalls}
                        onChange={(targetPotentialCalls) =>
                          updateDraft(saved.userId, { targetPotentialCalls })
                        }
                      />
                    </TD>
                    <TD>
                      <TargetNumInput
                        className="w-20 rounded border px-2 py-1 text-xs"
                        value={draft.targetPotentialSold}
                        onChange={(targetPotentialSold) =>
                          updateDraft(saved.userId, { targetPotentialSold })
                        }
                      />
                    </TD>
                    <TD>
                      <TargetNumInput
                        className="w-20 rounded border px-2 py-1 text-xs"
                        value={draft.targetExistingCalls}
                        onChange={(targetExistingCalls) =>
                          updateDraft(saved.userId, { targetExistingCalls })
                        }
                      />
                    </TD>
                    <TD>
                      <TargetNumInput
                        className="w-20 rounded border px-2 py-1 text-xs"
                        value={draft.targetExistingSold}
                        onChange={(targetExistingSold) =>
                          updateDraft(saved.userId, { targetExistingSold })
                        }
                      />
                    </TD>
                    <TD>
                      <TargetNumInput
                        className="w-20 rounded border px-2 py-1 text-xs"
                        value={draft.minCallsPerDay}
                        onChange={(minCallsPerDay) => updateDraft(saved.userId, { minCallsPerDay })}
                      />
                    </TD>
                    <TD>
                      <TargetNumInput
                        className="w-24 rounded border px-2 py-1 text-xs"
                        value={draft.minTalkTimeMinPerDay}
                        onChange={(minTalkTimeMinPerDay) =>
                          updateDraft(saved.userId, { minTalkTimeMinPerDay })
                        }
                      />
                    </TD>
                    {planColumns.map((tier) => (
                      <TD key={`${saved.userId}-${tier}`}>
                        <TargetNumInput
                          className="w-24 rounded border px-2 py-1 text-xs"
                          value={draft.planTargets?.[tier]}
                          onChange={(n) =>
                            updatePlanDraft(saved.userId, tier, n == null ? "" : String(n))
                          }
                        />
                      </TD>
                    ))}
                    <TD className="min-w-[120px]">
                      <div className="flex flex-col gap-1">
                        <Button
                          size="sm"
                          disabled={!dirty || saving}
                          onClick={() => void saveRow(saved.userId)}
                        >
                          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
                        </Button>
                        {savedAtMap[saved.userId] ? (
                          <span className="text-[10px] text-slate-muted">Saved {savedAtMap[saved.userId]}</span>
                        ) : dirty ? (
                          <span className="text-[10px] text-amber-700">Unsaved changes</span>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
