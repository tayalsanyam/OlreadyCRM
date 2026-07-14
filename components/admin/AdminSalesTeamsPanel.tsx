"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type TeamMember = { id: string; name: string };
type Team = {
  id: string;
  name: string;
  tlId: string;
  tlName: string | null;
  memberCount: number;
  members?: TeamMember[];
};
type User = { id: string; name: string; role: string; teamId?: string | null; active?: boolean };

export function AdminSalesTeamsPanel() {
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [tlId, setTlId] = useState("");
  const [createMemberIds, setCreateMemberIds] = useState<string[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [editName, setEditName] = useState("");
  const [editTlId, setEditTlId] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [a, b] = await Promise.all([
      fetch("/api/admin/sales/teams").then((r) => r.json()),
      fetch("/api/admin/users").then((r) => r.json()),
    ]);
    setTeams(a.data ?? []);
    setUsers(b.data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  const tls = users.filter((u) => u.role === "salesTl" && u.active !== false);
  const salesRms = users.filter((u) => u.role === "salesRm" && u.active !== false);

  const unassignedRms = useMemo(
    () => salesRms.filter((u) => !u.teamId),
    [salesRms],
  );

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null;
  const selectedTeamMembers = useMemo(() => {
    if (!selectedTeamId) return [];
    return salesRms.filter((u) => u.teamId === selectedTeamId);
  }, [salesRms, selectedTeamId]);

  const availableToAdd = useMemo(() => {
    if (!selectedTeamId) return [];
    return salesRms.filter((u) => !u.teamId);
  }, [salesRms, selectedTeamId]);

  function toggleCreateMember(id: string) {
    setCreateMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function createTeam() {
    if (!name.trim() || !tlId) {
      toast("Team name and team lead are required", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/sales/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          tlId,
          memberIds: createMemberIds,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(json.error ?? "Create failed", "error");
        return;
      }
      toast(
        createMemberIds.length
          ? `Team created with ${createMemberIds.length} member(s)`
          : "Team created — add members below when ready",
      );
      setName("");
      setTlId("");
      setCreateMemberIds([]);
      await load();
      if (json.data?.id) {
        setSelectedTeamId(json.data.id);
        setEditName(json.data.name ?? name.trim());
        setEditTlId(json.data.tlId ?? tlId);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteTeam(id: string) {
    if (!confirm("Delete this team? Members will be unassigned from the team.")) return;
    const res = await fetch(`/api/admin/sales/teams/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(json.error ?? "Delete failed", "error");
      return;
    }
    toast("Team deleted");
    if (selectedTeamId === id) setSelectedTeamId("");
    void load();
  }

  async function patchTeam(body: {
    name?: string;
    tlId?: string;
    addMemberIds?: string[];
    removeMemberIds?: string[];
  }) {
    if (!selectedTeamId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/sales/teams/${selectedTeamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(json.error ?? "Update failed", "error");
        return false;
      }
      await load();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function saveTeamMeta() {
    const ok = await patchTeam({
      name: editName.trim() || undefined,
      tlId: editTlId || undefined,
    });
    if (ok) toast("Team updated");
  }

  async function addMember(staffId: string) {
    const ok = await patchTeam({ addMemberIds: [staffId] });
    if (ok) toast("Member added");
  }

  async function removeMember(staffId: string) {
    const ok = await patchTeam({ removeMemberIds: [staffId] });
    if (ok) toast("Member removed");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">Sales teams</h1>
        <p className="text-sm text-slate-muted">
          Create a team with a lead, then choose which sales RMs join. Nobody is added unless you
          select them.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-brand">Create team</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="Team name"
            placeholder="e.g. Team Alpha"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text">Team lead (Sales TL)</span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={tlId}
              onChange={(e) => setTlId(e.target.value)}
            >
              <option value="">Select team lead</option>
              {tls.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-text">
            Sales RM members (optional — none selected by default)
          </p>
          {unassignedRms.length === 0 ? (
            <p className="text-sm text-slate-muted">
              No unassigned sales RMs. Remove someone from another team first, or create sales RM
              users.
            </p>
          ) : (
            <ul className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {unassignedRms.map((u) => (
                <li key={u.id}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createMemberIds.includes(u.id)}
                      onChange={() => toggleCreateMember(u.id)}
                    />
                    {u.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button onClick={() => void createTeam()} disabled={saving}>
          Create team
        </Button>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>TL</TH>
            <TH>Members</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {teams.map((t) => (
            <TR key={t.id}>
              <TD className="font-medium">{t.name}</TD>
              <TD>{t.tlName ?? "—"}</TD>
              <TD className="text-sm">
                <span className="font-medium">{t.memberCount}</span>
                {t.members?.length ? (
                  <span className="text-slate-muted">
                    {" "}
                    — {t.members.map((m) => m.name).join(", ")}
                  </span>
                ) : (
                  <span className="text-slate-muted"> — none</span>
                )}
              </TD>
              <TD className="space-x-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSelectedTeamId(t.id);
                    setEditName(t.name);
                    setEditTlId(t.tlId);
                  }}
                >
                  Manage
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void deleteTeam(t.id)}>
                  Delete
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      {selectedTeam ? (
        <div className="space-y-4 rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-brand">Manage — {selectedTeam.name}</h2>
            <Button variant="ghost" size="sm" onClick={() => setSelectedTeamId("")}>
              Close
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Team name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text">Team lead</span>
              <select
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={editTlId}
                onChange={(e) => setEditTlId(e.target.value)}
              >
                <option value="">Select TL</option>
                {tls.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button size="sm" variant="secondary" disabled={saving} onClick={() => void saveTeamMeta()}>
            Save name &amp; lead
          </Button>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-sm font-medium text-text">On this team</p>
              {selectedTeamMembers.length === 0 ? (
                <p className="text-sm text-slate-muted">No sales RMs yet.</p>
              ) : (
                <ul className="space-y-2">
                  {selectedTeamMembers.map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>{u.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-700"
                        disabled={saving}
                        onClick={() => void removeMember(u.id)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-sm font-medium text-text">Add from unassigned</p>
              {availableToAdd.length === 0 ? (
                <p className="text-sm text-slate-muted">
                  Everyone is on a team already. Remove from another team to move them here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {availableToAdd.map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>{u.name}</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={saving}
                        onClick={() => void addMember(u.id)}
                      >
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <p className={cn("text-xs text-slate-muted")}>
            Team lead is linked to the team automatically. Only sales RMs you add appear as members.
          </p>
        </div>
      ) : null}
    </div>
  );
}
