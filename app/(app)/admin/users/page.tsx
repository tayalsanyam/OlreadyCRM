"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SlideOver } from "@/components/ui/SlideOver";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import type { Region, User, UserRole } from "@/lib/types";
import { AdminConfigUsersNav } from "@/components/admin/AdminConfigUsersNav";
import { AdminExportCsvButton } from "@/components/admin/AdminExportCsvButton";
import { CallyzerSyncButton } from "@/components/callyzer/CallyzerSyncButton";
import { validateCallyzerNumberInput } from "@/lib/callyzer-identity";
import { apiErrorMessage } from "@/lib/api-json";
import { cn, formatDate } from "@/lib/utils";

const ROLE_BADGE: Record<UserRole, string> = {
  regionalRm: "bg-brand/10 text-brand",
  commissionRm: "bg-teal-100 text-teal-800",
  leadUploader: "bg-slate-200 text-slate-700",
  feedbackRm: "bg-cyan-100 text-cyan-900",
  careAgent: "bg-rose-100 text-rose-900",
  salesRm: "bg-emerald-100 text-emerald-900",
  salesTl: "bg-emerald-200 text-emerald-900",
  salesActivation: "bg-indigo-100 text-indigo-900",
  admin: "bg-amber-100 text-amber-900",
  owner: "bg-purple-100 text-purple-900",
};

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "regionalRm", label: "Regional RM" },
  { value: "commissionRm", label: "Commission RM" },
  { value: "leadUploader", label: "Lead Uploader" },
  { value: "feedbackRm", label: "Feedback" },
  { value: "careAgent", label: "Care Agent" },
  { value: "salesRm", label: "Sales RM" },
  { value: "salesTl", label: "Sales TL" },
  { value: "salesActivation", label: "Sales Activation" },
  { value: "admin", label: "Admin" },
];

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">(
    "active"
  );
  const [modal, setModal] = useState<{ mode: "add" | "edit"; user?: User } | null>(
    null
  );
  const [transfer, setTransfer] = useState<User | null>(null);
  const [transferToId, setTransferToId] = useState("");
  const [transferPreview, setTransferPreview] = useState<{
    preview: {
      pendingTasks: number;
      brideLeadsAssigned: number;
      muasAssignedRm: number;
      salesPipelinesActive: number;
      muasSalesClosedBy: number;
      salesTeamsAsLead: number;
    } | null;
    eligible: { id: string; name: string; email: string; regions: Region[] }[];
    regionMismatch: {
      missingRegions: Region[];
      targetRegions: Region[];
    } | null;
    migratable: boolean;
    reason?: string;
  } | null>(null);
  const [transferRegionsToAdd, setTransferRegionsToAdd] = useState<Region[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "regionalRm" as UserRole,
    region: "north" as Region,
    regions: ["north"] as Region[],
    callyzerNumber: "",
  });

  const load = useCallback(() => {
    void fetch("/api/admin/users")
      .then((r) => r.json())
      .then((json: { data: User[] }) => setUsers(json.data ?? []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (activeFilter === "active" && !u.active) return false;
      if (activeFilter === "inactive" && u.active) return false;
      return true;
    });
  }, [users, roleFilter, activeFilter]);

  const REGIONS: Region[] = ["north", "east", "west", "south"];

  function toggleFormRegion(r: Region) {
    setForm((f) => {
      const has = f.regions.includes(r);
      const regions = has ? f.regions.filter((x) => x !== r) : [...f.regions, r];
      return {
        ...f,
        regions,
        region: regions[0] ?? f.region,
      };
    });
  }

  function openAdd() {
    setForm({
      name: "",
      email: "",
      password: "",
      role: "regionalRm",
      region: "north",
      regions: ["north"],
      callyzerNumber: "",
    });
    setModal({ mode: "add" });
  }

  function openEdit(u: User) {
    const regions =
      u.regions?.length ? u.regions : u.region ? [u.region] : ["north"];
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      region: (regions[0] ?? "north") as Region,
      regions: [...regions] as Region[],
      callyzerNumber: u.callyzerNumber ?? "",
    });
    setModal({ mode: "edit", user: u });
  }

  async function save() {
    const callyzerError = validateCallyzerNumberInput(form.callyzerNumber);
    if (callyzerError) {
      toast(callyzerError, "error");
      return;
    }

    if (modal?.mode === "add") {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          regions:
            form.role === "regionalRm" ? form.regions : undefined,
          region:
            form.role === "regionalRm" ? form.regions[0] ?? form.region : null,
          callyzerNumber: form.callyzerNumber.trim() || null,
        }),
      });
      if (res.ok) {
        toast("User created");
        setModal(null);
        load();
      } else {
        toast(await apiErrorMessage(res, "Failed to create user"), "error");
      }
    } else if (modal?.user) {
      const res = await fetch(`/api/admin/users/${modal.user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          role: form.role,
          regions: form.role === "regionalRm" ? form.regions : undefined,
          region: form.role === "regionalRm" ? form.regions[0] ?? form.region : null,
          callyzerNumber: form.callyzerNumber.trim() || null,
          ...(form.password ? { password: form.password } : {}),
        }),
      });
      if (res.ok) {
        toast("User updated");
        setModal(null);
        load();
      } else {
        toast(await apiErrorMessage(res, "Failed to update user"), "error");
      }
    }
  }

  async function deactivate(u: User) {
    if (!confirm(`Deactivate ${u.name}? They will lose access immediately.`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    if (res.ok) {
      toast("User deactivated");
      load();
    } else {
      toast(await apiErrorMessage(res, "Failed to deactivate"), "error");
    }
  }

  async function reactivate(u: User) {
    if (!confirm(`Reactivate ${u.name}? They will regain access immediately.`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    if (res.ok) {
      toast("User reactivated");
      load();
    } else {
      toast(await apiErrorMessage(res, "Failed to reactivate"), "error");
    }
  }

  const loadTransferPreview = useCallback(
    async (from: User, toId?: string) => {
      setTransferLoading(true);
      try {
        const q = toId ? `?toStaffId=${encodeURIComponent(toId)}` : "";
        const res = await fetch(`/api/admin/users/${from.id}/migrate${q}`);
        const json = (await res.json()) as {
          data: typeof transferPreview;
          error: string | null;
        };
        if (!res.ok) {
          toast(json.error ?? "Failed to load transfer preview", "error");
          return;
        }
        setTransferPreview(json.data);
        if (json.data?.regionMismatch) {
          setTransferRegionsToAdd(json.data.regionMismatch.missingRegions);
        } else {
          setTransferRegionsToAdd([]);
        }
      } finally {
        setTransferLoading(false);
      }
    },
    [toast],
  );

  function openTransfer(u: User) {
    setTransfer(u);
    setTransferToId("");
    setTransferPreview(null);
    setTransferRegionsToAdd([]);
    void loadTransferPreview(u);
  }

  async function runTransfer() {
    if (!transfer || !transferToId) {
      toast("Select a successor", "error");
      return;
    }
    if (transferPreview?.regionMismatch) {
      const missing = transferPreview.regionMismatch.missingRegions;
      if (!missing.every((r) => transferRegionsToAdd.includes(r))) {
        toast(
          "Successor must cover all lead regions — confirm regions to add or edit the user first",
          "error",
        );
        return;
      }
    }
    if (
      !confirm(
        `Migrate open workload from ${transfer.name} to the selected user?\n\nHistorical logs and attribution stay on ${transfer.name}. This does not deactivate them.`,
      )
    ) {
      return;
    }
    setTransferLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${transfer.id}/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStaffId: transferToId,
          ...(transferRegionsToAdd.length
            ? { addRegionsToTarget: transferRegionsToAdd }
            : {}),
        }),
      });
      const json = (await res.json()) as {
        data: {
          moved?: {
            pendingTasks: number;
            brideLeadsAssigned: number;
            muasAssignedRm: number;
            salesPipelinesActive: number;
            muasSalesClosedBy: number;
            salesTeamsAsLead: number;
          };
        } | null;
        error: string | null;
      };
      if (res.ok) {
        const m = json.data?.moved;
        const parts: string[] = [];
        if (m?.brideLeadsAssigned) parts.push(`${m.brideLeadsAssigned} lead(s)`);
        if (m?.muasAssignedRm) parts.push(`${m.muasAssignedRm} MUA(s)`);
        if (m?.salesPipelinesActive) parts.push(`${m.salesPipelinesActive} pipeline(s)`);
        if (m?.muasSalesClosedBy) parts.push(`${m.muasSalesClosedBy} closer link(s)`);
        if (m?.salesTeamsAsLead) parts.push(`${m.salesTeamsAsLead} team(s) as TL`);
        if (m?.pendingTasks) parts.push(`${m.pendingTasks} task(s)`);
        toast(parts.length ? `Transferred: ${parts.join(", ")}` : "Nothing open to transfer");
        setTransfer(null);
        load();
      } else {
        toast(json.error ?? "Transfer failed", "error");
      }
    } finally {
      setTransferLoading(false);
    }
  }

  async function removeUser(u: User) {
    if (
      !confirm(
        `Permanently delete ${u.name} (${u.email})?\n\nThis cannot be undone. If they have CRM history, deletion will be blocked — use Deactivate instead.`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/users/${u.id}?permanent=1`, { method: "DELETE" });
    if (res.ok) {
      toast("User deleted");
      load();
    } else {
      toast(await apiErrorMessage(res, "Failed to delete user"), "error");
    }
  }

  return (
    <div className="space-y-6">
      <AdminConfigUsersNav />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand">Users</h1>
        <div className="flex gap-2">
          <AdminExportCsvButton apiPath="/api/admin/users" />
          <Button onClick={openAdd}>+ Add User</Button>
        </div>
      </div>

      <Card className="flex flex-wrap gap-4 p-4">
        <Select
          label="Role"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          options={[
            { value: "", label: "All roles" },
            ...ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label })),
            { value: "owner", label: "Owner" },
          ]}
        />
        <Select
          label="Status"
          value={activeFilter}
          onChange={(e) =>
            setActiveFilter(e.target.value as "all" | "active" | "inactive")
          }
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
      </Card>

      <Card className="overflow-hidden p-0">
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Region</TH>
              <TH>Status</TH>
              <TH>Callyzer Number</TH>
              <TH>Joined</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {filtered.map((u) => (
              <TR key={u.id}>
                <TD className="font-medium">{u.name}</TD>
                <TD>{u.email}</TD>
                <TD>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                      ROLE_BADGE[u.role]
                    )}
                  >
                    {u.role.replace(/([A-Z])/g, " $1")}
                  </span>
                </TD>
                <TD className="capitalize text-xs">
                  {u.regions?.length
                    ? u.regions.join(", ")
                    : u.region ?? "—"}
                </TD>
                <TD>{u.active ? "Active" : "Inactive"}</TD>
                <TD className="text-xs text-slate-muted">{u.callyzerNumber ?? "—"}</TD>
                <TD className="text-xs text-slate-muted">
                  {formatDate(u.createdAt.slice(0, 10))}
                </TD>
                <TD className="space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                    Edit
                  </Button>
                  {u.role !== "owner" &&
                    u.role !== "admin" &&
                    u.role !== "leadUploader" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openTransfer(u)}
                      >
                        Transfer
                      </Button>
                    )}
                  {u.active && u.role !== "owner" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void deactivate(u)}
                    >
                      Deactivate
                    </Button>
                  )}
                  {!u.active && u.role !== "owner" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-emerald-700 hover:text-emerald-800"
                      onClick={() => void reactivate(u)}
                    >
                      Reactivate
                    </Button>
                  )}
                  {u.role !== "owner" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-700 hover:text-red-800"
                      onClick={() => void removeUser(u)}
                    >
                      Delete
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <SlideOver
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === "add" ? "Add user" : "Edit user"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button onClick={() => void save()}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            disabled={modal?.mode === "edit"}
          />
          <Input
            label={modal?.mode === "add" ? "Password" : "Password (leave blank = no change)"}
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Input
            label="Callyzer Number (sales calling number)"
            placeholder="e.g. 9876543210"
            value={form.callyzerNumber}
            onChange={(e) => setForm({ ...form, callyzerNumber: e.target.value })}
          />
          {form.callyzerNumber.trim() && validateCallyzerNumberInput(form.callyzerNumber) ? (
            <p className="text-xs text-amber-700">{validateCallyzerNumberInput(form.callyzerNumber)}</p>
          ) : (
            <p className="text-xs text-slate-muted">Must be a 10-digit Indian mobile (Callyzer line).</p>
          )}
          {modal?.mode === "edit" && modal.user && (
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-sm font-medium text-text">Callyzer call sync</p>
              <CallyzerSyncButton
                statusUrl={`/api/admin/users/${modal.user.id}/callyzer-sync`}
                syncUrl={`/api/admin/users/${modal.user.id}/callyzer-sync`}
                label="Refresh calls for this user"
              />
            </div>
          )}
          <Select
            label="Role"
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value as UserRole })
            }
            options={ROLE_OPTIONS.map((r) => ({
              value: r.value,
              label: r.label,
            }))}
          />
          {(form.role === "regionalRm" ||
            (modal?.mode === "edit" && modal.user?.role === "regionalRm")) && (
            <div>
              <p className="mb-2 text-sm font-medium text-text">Regions</p>
              <div className="flex flex-wrap gap-2">
                {REGIONS.map((r) => (
                  <label
                    key={r}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm capitalize"
                  >
                    <input
                      type="checkbox"
                      checked={form.regions.includes(r)}
                      onChange={() => toggleFormRegion(r)}
                    />
                    {r}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </SlideOver>

      <SlideOver
        open={!!transfer}
        onClose={() => setTransfer(null)}
        title={transfer ? `Transfer workload — ${transfer.name}` : "Transfer workload"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTransfer(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                transferLoading ||
                !transferToId ||
                transferPreview?.migratable === false
              }
              onClick={() => void runTransfer()}
            >
              {transferLoading ? "Loading…" : "Run transfer"}
            </Button>
          </>
        }
      >
        {transfer && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-muted">
              Moves open work to another active user with the same role. Call logs,
              stage history, pushes, bookings, and targets stay attributed to{" "}
              {transfer.name}. Deactivate them separately after handover.
            </p>

            {transferPreview?.migratable === false && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                {transferPreview.reason ?? "Migration not available for this role."}
              </p>
            )}

            {transferPreview?.migratable !== false && (
              <>
                <Select
                  label="Transfer to"
                  value={transferToId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTransferToId(id);
                    if (transfer) void loadTransferPreview(transfer, id || undefined);
                  }}
                  options={[
                    { value: "", label: "Select user…" },
                    ...(transferPreview?.eligible ?? []).map((u) => ({
                      value: u.id,
                      label: `${u.name} (${u.email})`,
                    })),
                  ]}
                />

                {transferPreview?.preview && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 font-medium">Open workload</p>
                    <ul className="list-inside list-disc space-y-1 text-slate-muted">
                      {transferPreview.preview.brideLeadsAssigned > 0 && (
                        <li>{transferPreview.preview.brideLeadsAssigned} assigned lead(s)</li>
                      )}
                      {transferPreview.preview.muasAssignedRm > 0 && (
                        <li>{transferPreview.preview.muasAssignedRm} assigned MUA(s)</li>
                      )}
                      {transferPreview.preview.salesPipelinesActive > 0 && (
                        <li>{transferPreview.preview.salesPipelinesActive} active pipeline(s)</li>
                      )}
                      {transferPreview.preview.muasSalesClosedBy > 0 && (
                        <li>{transferPreview.preview.muasSalesClosedBy} MUA closer link(s)</li>
                      )}
                      {transferPreview.preview.salesTeamsAsLead > 0 && (
                        <li>{transferPreview.preview.salesTeamsAsLead} sales team(s) as TL</li>
                      )}
                      {transferPreview.preview.pendingTasks > 0 && (
                        <li>{transferPreview.preview.pendingTasks} pending task(s)</li>
                      )}
                      {!transferPreview.preview.brideLeadsAssigned &&
                        !transferPreview.preview.muasAssignedRm &&
                        !transferPreview.preview.salesPipelinesActive &&
                        !transferPreview.preview.muasSalesClosedBy &&
                        !transferPreview.preview.salesTeamsAsLead &&
                        !transferPreview.preview.pendingTasks && (
                          <li>No open items to move</li>
                        )}
                    </ul>
                  </div>
                )}

                {transferPreview?.regionMismatch && transferToId && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <p className="mb-2 font-medium text-amber-950">
                      Region mismatch — successor does not cover all lead regions
                    </p>
                    <p className="mb-2 text-amber-900">
                      Missing: {transferPreview.regionMismatch.missingRegions.join(", ")}
                    </p>
                    <p className="mb-2 text-xs text-amber-800">
                      Add regions to the successor before transfer (or edit the user
                      separately):
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {transferPreview.regionMismatch.missingRegions.map((r) => (
                        <label
                          key={r}
                          className="flex cursor-pointer items-center gap-2 rounded border border-amber-200 bg-white px-2 py-1 capitalize"
                        >
                          <input
                            type="checkbox"
                            checked={transferRegionsToAdd.includes(r)}
                            onChange={() => {
                              setTransferRegionsToAdd((prev) =>
                                prev.includes(r)
                                  ? prev.filter((x) => x !== r)
                                  : [...prev, r],
                              );
                            }}
                          />
                          {r}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </SlideOver>
    </div>
  );
}
