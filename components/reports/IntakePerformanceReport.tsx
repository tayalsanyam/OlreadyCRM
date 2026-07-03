"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { INTAKE_MIN_PROFILES } from "@/lib/lead-intake-config";
import { cn } from "@/lib/utils";

type SummaryRow = {
  staffId: string;
  staffName: string;
  role: string;
  region: string | null;
  pendingConfirmation: number;
  awaitingProfiles: number;
  intakeGateComplete: number;
  overdueIntakeTasks: number;
  pendingIntakeTasks: number;
};

type LeadRow = {
  leadId: string;
  displayId: string;
  brideName: string;
  region: string | null;
  status: string;
  confirmationStatus: string;
  intakeProfilesCount: number;
  intakeGateComplete: boolean;
  confirmationAttempts: number;
  pendingTaskType: string | null;
  pendingTaskTitle: string | null;
  pendingTaskDue: string | null;
  assignedRmName: string | null;
  daysSinceAssignment: number | null;
  daysToConfirm: number | null;
};

type OverdueTaskRow = {
  taskId: string;
  taskType: string;
  title: string;
  dueDate: string;
  staffId: string;
  staffName: string;
  leadId: string | null;
  displayId: string | null;
  brideName: string | null;
  leadStatus: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  regional_rm: "Regional RM",
  commission_rm: "Commission RM",
};

function taskTypeLabel(taskType: string | null) {
  if (!taskType) return null;
  if (taskType === "bride_confirmation") return "Bride confirmation";
  if (taskType === "share_profiles") return "Share profiles";
  if (taskType === "lead_progress_follow_up") return "Progress follow-up";
  return taskType;
}

export function IntakePerformanceReport({
  apiBase = "/api/admin/reports",
  scoped = false,
}: {
  apiBase?: string;
  scoped?: boolean;
}) {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<OverdueTaskRow[]>([]);
  const [region, setRegion] = useState("");
  const [staffId, setStaffId] = useState("");
  const [role, setRole] = useState("");
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([]);
  const [gate, setGate] = useState("");
  const [confirmationStatus, setConfirmationStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    if (staffId) params.set("staffId", staffId);
    if (role) params.set("role", role);
    if (gate) params.set("gate", gate);
    if (confirmationStatus) params.set("confirmationStatus", confirmationStatus);
    void fetch(`${apiBase}/intake?${params}`)
      .then((r) => r.json())
      .then((json: {
        data: {
          summary: SummaryRow[];
          leads: LeadRow[];
          overdueTasks?: OverdueTaskRow[];
        } | null;
      }) => {
        setSummary(json.data?.summary ?? []);
        setLeads(json.data?.leads ?? []);
        setOverdueTasks(json.data?.overdueTasks ?? []);
      })
      .finally(() => setLoading(false));
  }, [apiBase, region, staffId, role, gate, confirmationStatus]);

  useEffect(() => {
    const url =
      role === "commission_rm"
        ? "/api/admin/rms?role=commission_rm"
        : role === "regional_rm"
          ? "/api/admin/rms"
          : null;
    if (!url) {
      setStaffOptions([]);
      return;
    }
    void fetch(url)
      .then((r) => r.json())
      .then((json: { data: { id: string; name: string }[] }) => {
        setStaffOptions(json.data ?? []);
      });
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(
    () =>
      summary.reduce(
        (acc, row) => ({
          pendingConfirmation: acc.pendingConfirmation + row.pendingConfirmation,
          awaitingProfiles: acc.awaitingProfiles + row.awaitingProfiles,
          overdueIntakeTasks: acc.overdueIntakeTasks + row.overdueIntakeTasks,
          pendingIntakeTasks: acc.pendingIntakeTasks + row.pendingIntakeTasks,
        }),
        {
          pendingConfirmation: 0,
          awaitingProfiles: 0,
          overdueIntakeTasks: 0,
          pendingIntakeTasks: 0,
        }
      ),
    [summary]
  );

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-brand">Intake workflow</h2>
            <p className="text-sm text-slate-muted">
              Bride confirmation → share {INTAKE_MIN_PROFILES} profiles → CRM tasks unlock
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const params = new URLSearchParams();
              if (region) params.set("region", region);
              if (staffId) params.set("staffId", staffId);
              if (role) params.set("role", role);
              if (gate) params.set("gate", gate);
              if (confirmationStatus) params.set("confirmationStatus", confirmationStatus);
              params.set("format", "csv");
              window.location.href = `${apiBase}/intake?${params}`;
            }}
          >
            Export CSV
          </Button>
        </div>

        {!scoped && (
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              Region
              <select
                className="ml-2 rounded border px-2 py-1"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="">All</option>
                {["north", "east", "west", "south"].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Role
              <select
                className="ml-2 rounded border px-2 py-1"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setStaffId("");
                }}
              >
                <option value="">All</option>
                <option value="regional_rm">Regional RM</option>
                <option value="commission_rm">Commission RM</option>
              </select>
            </label>
            <label className="text-sm">
              Staff
              <select
                className="ml-2 rounded border px-2 py-1"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                disabled={!role}
              >
                <option value="">{role ? "All in role" : "Select role first"}</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            Gate
            <select
              className="ml-2 rounded border px-2 py-1"
              value={gate}
              onChange={(e) => setGate(e.target.value)}
            >
              <option value="">All open leads</option>
              <option value="open">Intake incomplete</option>
              <option value="complete">Intake complete</option>
            </select>
          </label>
          <label className="text-sm">
            Confirmation
            <select
              className="ml-2 rounded border px-2 py-1"
              value={confirmationStatus}
              onChange={(e) => setConfirmationStatus(e.target.value)}
            >
              <option value="">Any</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </label>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Awaiting confirmation", totals.pendingConfirmation, "amber"],
          [`Confirmed, under ${INTAKE_MIN_PROFILES} profiles`, totals.awaitingProfiles, "blue"],
          ["Overdue intake tasks", totals.overdueIntakeTasks, "red"],
          ["Pending intake tasks", totals.pendingIntakeTasks, "slate"],
        ].map(([label, value, tone]) => (
          <Card key={String(label)} className="p-4">
            <p className="text-xs text-slate-muted">{label}</p>
            <p
              className={cn(
                "text-2xl font-bold",
                tone === "red" && Number(value) > 0
                  ? "text-red-700"
                  : tone === "amber" && Number(value) > 0
                    ? "text-amber-700"
                    : "text-brand"
              )}
            >
              {value}
            </p>
          </Card>
        ))}
      </div>

      {!scoped && summary.length > 0 && (
        <Card className="overflow-hidden p-0">
          <h3 className="border-b px-4 py-3 font-semibold text-brand">By RM</h3>
          <Table>
            <THead>
              <TR>
                <TH>RM</TH>
                <TH>Role</TH>
                <TH>Region</TH>
                <TH>Pending confirm</TH>
                <TH>Awaiting profiles</TH>
                <TH>Gate complete</TH>
                <TH>Overdue tasks</TH>
                <TH>Pending tasks</TH>
              </TR>
            </THead>
            <TBody>
              {summary.map((row) => (
                <TR key={row.staffId}>
                  <TD className="font-medium">{row.staffName}</TD>
                  <TD>{ROLE_LABEL[row.role] ?? row.role}</TD>
                  <TD className="capitalize">{row.region ?? "—"}</TD>
                  <TD>{row.pendingConfirmation}</TD>
                  <TD>{row.awaitingProfiles}</TD>
                  <TD>{row.intakeGateComplete}</TD>
                  <TD>
                    {row.overdueIntakeTasks > 0 ? (
                      <Badge variant="hot">{row.overdueIntakeTasks}</Badge>
                    ) : (
                      "0"
                    )}
                  </TD>
                  <TD>{row.pendingIntakeTasks}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {!scoped && overdueTasks.length > 0 && (
        <Card className="overflow-hidden p-0">
          <h3 className="border-b px-4 py-3 font-semibold text-brand">
            Overdue intake tasks ({overdueTasks.length})
          </h3>
          <Table>
            <THead>
              <TR>
                <TH>RM</TH>
                <TH>Task</TH>
                <TH>Lead</TH>
                <TH>Lead status</TH>
                <TH>Due</TH>
              </TR>
            </THead>
            <TBody>
              {overdueTasks.map((t) => (
                <TR key={t.taskId}>
                  <TD className="font-medium">{t.staffName}</TD>
                  <TD className="text-sm">
                    <span className="block text-xs text-slate-muted">
                      {taskTypeLabel(t.taskType)}
                    </span>
                    {t.title}
                  </TD>
                  <TD>
                    {t.leadId ? (
                      <>
                        <Link
                          href={`/rm/leads/${t.leadId}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {t.brideName}
                        </Link>
                        <p className="text-xs text-slate-muted">{t.displayId}</p>
                      </>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="capitalize text-sm">{t.leadStatus ?? "—"}</TD>
                  <TD className="font-semibold text-red-700">{t.dueDate}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <h3 className="border-b px-4 py-3 font-semibold text-brand">
          Leads {loading ? "…" : `(${leads.length})`}
        </h3>
        <Table>
          <THead>
            <TR>
              <TH>Lead</TH>
              {!scoped && <TH>RM</TH>}
              <TH>Confirmation</TH>
              <TH>Profiles</TH>
              <TH>Intake task</TH>
              <TH>Due</TH>
              <TH>Days to confirm</TH>
            </TR>
          </THead>
          <TBody>
            {leads.length === 0 ? (
              <TR>
                <TD colSpan={scoped ? 6 : 7} className="py-8 text-center text-slate-muted">
                  No leads match these filters
                </TD>
              </TR>
            ) : (
              leads.map((l) => (
                <TR key={l.leadId}>
                  <TD>
                    <Link
                      href={`/rm/leads/${l.leadId}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {l.brideName}
                    </Link>
                    <p className="text-xs text-slate-muted">{l.displayId}</p>
                  </TD>
                  {!scoped && <TD>{l.assignedRmName ?? "—"}</TD>}
                  <TD>
                    <Badge
                      variant={l.confirmationStatus === "confirmed" ? "success" : "muted"}
                    >
                      {l.confirmationStatus}
                    </Badge>
                  </TD>
                  <TD>
                    {l.intakeProfilesCount}/{INTAKE_MIN_PROFILES}
                    {l.intakeGateComplete && (
                      <span className="ml-1 text-xs text-emerald-700">✓</span>
                    )}
                  </TD>
                  <TD className="text-sm">
                    {l.pendingTaskTitle ? (
                      <>
                        <span className="block text-xs text-slate-muted">
                          {taskTypeLabel(l.pendingTaskType)}
                        </span>
                        {l.pendingTaskTitle}
                      </>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>
                    {l.pendingTaskDue ? (
                      <span
                        className={cn(
                          l.pendingTaskDue < new Date().toISOString().slice(0, 10) &&
                            "font-semibold text-red-700"
                        )}
                      >
                        {l.pendingTaskDue}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>{l.daysToConfirm ?? "—"}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
