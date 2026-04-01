"use client";

import { useState, useEffect } from "react";
import useSWR, { mutate as revalidate } from "swr";

import { fetcher } from "@/lib/fetcher";

export default function AdminPage() {
  const { data: session } = useSWR("/api/auth/me", fetcher);
  const [active, setActive] = useState<"config" | "users" | "teams" | "import">("config");
  if (session?.user?.role !== "admin") {
    return (
      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-amber-400">
        Admin access required
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Admin</h1>
      <div className="flex gap-2">
        <button
          onClick={() => setActive("config")}
          className={active === "config" ? "btn-primary" : "btn-secondary"}
        >
          Config
        </button>
        <button
          onClick={() => setActive("users")}
          className={active === "users" ? "btn-primary" : "btn-secondary"}
        >
          Users
        </button>
        <button
          onClick={() => setActive("teams")}
          className={active === "teams" ? "btn-primary" : "btn-secondary"}
        >
          Teams
        </button>
        <button
          onClick={() => setActive("import")}
          className={active === "import" ? "btn-primary" : "btn-secondary"}
        >
          Import
        </button>
      </div>
      {active === "config" && <ConfigTab />}
      {active === "users" && <UsersTab />}
      {active === "teams" && <TeamsTab />}
      {active === "import" && <ImportTab />}
    </div>
  );
}

function SeedButton({ onDone }: { onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  async function handleSeed() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (res.ok) setResult(`Seeded ${data.leadsCreated} leads, ${data.tasksCreated} tasks`);
      else setResult(data.error || "Failed");
      onDone();
    } catch {
      setResult("Failed");
    } finally {
      setLoading(false);
    }
  }
  async function handleClear() {
    if (!confirm("Remove all sample leads? This cannot be undone.")) return;
    setClearing(true);
    setResult(null);
    try {
      const res = await fetch("/api/seed/clear", { method: "POST" });
      const data = await res.json();
      if (res.ok) setResult(data.message || `Cleared ${data.cleared} leads`);
      else setResult(data.error || "Failed");
      onDone();
    } catch {
      setResult("Failed");
    } finally {
      setClearing(false);
    }
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={handleSeed} className="btn-secondary text-sm" disabled={loading}>
        {loading ? "Seeding..." : "Seed Sample Data"}
      </button>
      <button onClick={handleClear} className="btn-ghost text-sm text-amber-400 hover:text-amber-300" disabled={clearing}>
        {clearing ? "Clearing..." : "Clear Sample Data"}
      </button>
      {result && <span className="text-sm text-slate-400">{result}</span>}
    </div>
  );
}

function ConfigTab() {
  const { data, mutate } = useSWR("/api/config", fetcher);
  const [bdms, setBdms] = useState("");
  const [opsCoordinators, setOpsCoordinators] = useState("");
  const [plans, setPlans] = useState<{ name: string; price: number; active: boolean }[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [renameOld, setRenameOld] = useState("");
  const [renameNew, setRenameNew] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [showInactivePlans, setShowInactivePlans] = useState(false);

  useEffect(() => {
    if (data) {
      setBdms((data.bdms ?? []).join("\n"));
      setOpsCoordinators((data.ops_coordinators ?? []).join("\n"));
      setPlans((data.plans ?? []).map((p: { name?: string; price?: number; active?: boolean }) => ({
        name: p.name ?? "",
        price: p.price ?? 0,
        active: p.active !== false,
      })));
      setTargets(data.targets ?? {});
    }
  }, [data]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bdms: bdms.split("\n").map((b) => b.trim()).filter(Boolean),
          ops_coordinators: opsCoordinators.split("\n").map((o) => o.trim()).filter(Boolean),
          plans,
          targets,
        }),
      });
      if (res.ok) {
        mutate();
        revalidate("/api/config/dropdowns");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    const oldN = renameOld.trim();
    const newN = renameNew.trim();
    if (!oldN || !newN) return;
    setRenaming(true);
    setRenameError(null);
    try {
      const res = await fetch("/api/config/bdm-rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName: oldN, newName: newN }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRenameError(json.error ?? "Rename failed");
        return;
      }
      setRenameOld("");
      setRenameNew("");
      setRenameError(null);
      setBdms((prev) =>
        prev
          .split("\n")
          .map((line) => (line.trim() === oldN ? newN : line.trim()))
          .filter(Boolean)
          .join("\n")
      );
      mutate(undefined, { revalidate: true });
      revalidate("/api/config/dropdowns");
    } finally {
      setRenaming(false);
    }
  }

  const bdmList = (data?.bdms ?? []) as string[];

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold text-white">BDMs (one per line)</h2>
      <p className="text-sm text-slate-400">Add or remove lines. To delete a BDM: remove its line and click Save. To rename: use the Rename section below.</p>
      <textarea
        value={bdms}
        onChange={(e) => setBdms(e.target.value)}
        className="input min-h-[100px]"
        placeholder="GAURAV&#10;GURKIRAN&#10;..."
      />
      {bdmList.length > 0 && (
        <div className="rounded border border-slate-600/50 bg-slate-800/30 p-4 space-y-3">
          <h3 className="font-medium text-white">Rename BDM</h3>
          <p className="text-sm text-slate-400">Select a BDM and enter a new name. This updates all leads, tasks, teams, and users. Do not edit the textarea above for renames.</p>
          <div className="flex flex-wrap items-end gap-2">
            <select
              value={renameOld}
              onChange={(e) => { setRenameOld(e.target.value); setRenameError(null); }}
              className="input w-40"
            >
              <option value="">Select BDM</option>
              {bdmList.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <span className="text-slate-500">→</span>
            <input
              type="text"
              value={renameNew}
              onChange={(e) => { setRenameNew(e.target.value); setRenameError(null); }}
              placeholder="New name"
              className="input w-40"
            />
            <button
              onClick={handleRename}
              disabled={renaming || !renameOld.trim() || !renameNew.trim()}
              className="btn-primary text-sm"
            >
              {renaming ? "Renaming..." : "Rename"}
            </button>
          </div>
          {renameError && <span className="text-sm text-amber-400">{renameError}</span>}
        </div>
      )}
      <h2 className="font-semibold text-white">Ops Coordinators (one per line)</h2>
      <p className="text-sm text-slate-400">For Customers on Plan. Add or remove lines and click Save.</p>
      <textarea
        value={opsCoordinators}
        onChange={(e) => setOpsCoordinators(e.target.value)}
        className="input min-h-[80px]"
        placeholder="Ops 1&#10;Ops 2&#10;..."
      />
      <h2 className="font-semibold text-white">Plans & Prices</h2>
      <p className="text-sm text-slate-400">Active plans appear in dropdowns for new leads. Uncheck to disable (existing clients keep their plan).</p>
      <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
        <input
          type="checkbox"
          checked={showInactivePlans}
          onChange={(e) => setShowInactivePlans(e.target.checked)}
          className="rounded"
        />
        Show inactive plans
      </label>
      <div className="space-y-2">
        {(showInactivePlans ? plans : plans.filter((p) => p.active)).map((p) => {
          const idx = plans.findIndex((x) => x === p);
          if (idx < 0) return null;
          return (
          <div key={p.name ? `${p.name}-${idx}` : `new-${idx}`} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={p.name}
              onChange={(e) => {
                const next = [...plans];
                next[idx] = { ...next[idx], name: e.target.value };
                setPlans(next);
              }}
              className="input flex-1 min-w-[120px]"
              placeholder="Plan name"
            />
            <input
              type="number"
              value={p.price || ""}
              onChange={(e) => {
                const next = [...plans];
                next[idx] = { ...next[idx], price: Number(e.target.value) };
                setPlans(next);
              }}
              className="input w-24"
              placeholder="Price"
            />
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={p.active}
                onChange={(e) => {
                  const next = [...plans];
                  next[idx] = { ...next[idx], active: e.target.checked };
                  setPlans(next);
                }}
                className="rounded"
              />
              Active
            </label>
          </div>
        ); })}
        <button
          onClick={() => setPlans([...plans, { name: "", price: 0, active: true }])}
          className="btn-secondary text-sm"
        >
          Add Plan
        </button>
      </div>
      <h2 className="font-semibold text-white">BDM Targets (₹)</h2>
      <div className="mb-4">
        <SeedButton onDone={() => mutate()} />
      </div>
      <div className="space-y-2">
        {Object.entries(targets).map(([bdm, val]) => (
          <div key={bdm} className="flex gap-2">
            <span className="w-24 text-slate-400">{bdm}</span>
            <input
              type="number"
              value={val || ""}
              onChange={(e) => setTargets((t) => ({ ...t, [bdm]: Number(e.target.value) }))}
              className="input w-32"
            />
          </div>
        ))}
      </div>
      <button onClick={handleSave} className="btn-primary" disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

function UserRow({
  user,
  onUpdate,
  currentUserId,
  canDelete,
  teamIds,
}: {
  user: { id: string; username: string; role: string; assigned_bdm?: string; team_id?: string; email?: string };
  onUpdate: () => void;
  currentUserId?: string;
  canDelete?: boolean;
  teamIds?: string[];
}) {
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailVal, setEmailVal] = useState(user.email ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [teamId, setTeamId] = useState(user.team_id ?? "");
  useEffect(() => {
    setTeamId(user.team_id ?? "");
  }, [user.team_id]);

  async function handleDelete() {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (res.ok) onUpdate();
      else {
        const d = await res.json();
        alert(d.error || "Delete failed");
      }
    } finally {
      setDeleting(false);
    }
  }

  async function saveEmail() {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailVal || null }),
      });
      if (res.ok) {
        setEditingEmail(false);
        onUpdate();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded bg-slate-700/50 p-2 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium">{user.username}</span>
        <span className="badge bg-slate-600">{user.role}</span>
        {user.assigned_bdm && <span className="text-slate-400">{user.assigned_bdm}</span>}
        {user.role === "team_leader" && teamIds && teamIds.length > 0 ? (
          <select
            value={teamId}
            onChange={(e) => {
              const v = e.target.value;
              setTeamId(v);
              if (v !== (user.team_id ?? "")) {
                setSaving(true);
                fetch(`/api/users/${user.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ team_id: v || null }),
                }).then((res) => {
                  if (res.ok) onUpdate();
                }).finally(() => setSaving(false));
              }
            }}
            disabled={saving}
            className="input text-sm py-1 w-32"
          >
            <option value="">— No team</option>
            {teamIds.map((tid) => (
              <option key={tid} value={tid}>{tid}</option>
            ))}
          </select>
        ) : user.team_id ? (
          <span className="text-slate-400">Team: {user.team_id}</span>
        ) : null}
      </div>
      {editingEmail ? (
        <div className="flex gap-1">
          <input
            type="email"
            value={emailVal}
            onChange={(e) => setEmailVal(e.target.value)}
            className="input w-40 text-sm"
            placeholder="email for digest"
          />
          <button onClick={saveEmail} className="btn-primary text-sm py-1" disabled={saving}>
            Save
          </button>
          <button onClick={() => { setEditingEmail(false); setEmailVal(user.email ?? ""); }} className="btn-secondary text-sm py-1">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditingEmail(true)}
          className="text-sm text-slate-400 hover:text-white"
        >
          {user.email || "+ Add email"}
        </button>
      )}
      {canDelete && currentUserId !== user.id && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-sm text-amber-400 hover:text-amber-300"
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
      )}
    </div>
  );
}

function UsersTab() {
  const { data: users = [], mutate } = useSWR("/api/users", fetcher);
  const { data: session } = useSWR("/api/auth/me", fetcher);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "team_leader" | "bdm">("bdm");
  const [assignedBdm, setAssignedBdm] = useState("");
  const [teamId, setTeamId] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: dropdowns } = useSWR("/api/config/dropdowns", fetcher);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          role,
          assigned_bdm: role === "bdm" ? assignedBdm : undefined,
          team_id: role === "team_leader" ? teamId || undefined : undefined,
        }),
      });
      if (res.ok) {
        setUsername("");
        setPassword("");
        setEmail("");
        mutate();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="mb-3 font-semibold text-white">Create User</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-4">
          <div>
            <label className="mb-1 block text-sm text-slate-400">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input w-40"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Email (for digest)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-48"
              placeholder="optional"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-40"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "team_leader" | "bdm")}
              className="input w-40"
            >
              <option value="admin">Admin</option>
              <option value="team_leader">Team Leader</option>
              <option value="bdm">BDM</option>
            </select>
          </div>
          {role === "bdm" && (
            <div>
              <label className="mb-1 block text-sm text-slate-400">Assigned BDM</label>
              <select
                value={assignedBdm}
                onChange={(e) => setAssignedBdm(e.target.value)}
                className="input w-40"
              >
                <option value="">Select</option>
                {(dropdowns?.bdms ?? []).map((b: string) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}
          {role === "team_leader" && (
            <div>
              <label className="mb-1 block text-sm text-slate-400">Team</label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="input w-40"
              >
                <option value="">Select</option>
                {(dropdowns?.teamIds ?? []).map((tid: string) => (
                  <option key={tid} value={tid}>{tid}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-end">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
      <div className="card">
        <h2 className="mb-3 font-semibold text-white">Users</h2>
        <div className="space-y-2">
          {users.map((u: { id: string; username: string; role: string; assigned_bdm?: string; team_id?: string; email?: string }) => {
            const admins = (users as { role: string }[]).filter((x) => x.role === "admin").length;
            const canDelete = u.role !== "admin" || admins > 1;
            return (
              <UserRow
                key={u.id}
                user={u}
                onUpdate={mutate}
                currentUserId={session?.user?.id}
                canDelete={canDelete}
                teamIds={dropdowns?.teamIds ?? []}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TeamsTab() {
  const { data, mutate } = useSWR("/api/config", fetcher);
  const [teams, setTeams] = useState<{ team_id: string; team_name: string; bdm: string }[]>([]);
  const { data: dropdowns } = useSWR("/api/config/dropdowns", fetcher);
  const { data: users = [] } = useSWR("/api/users", fetcher);
  const bdms = dropdowns?.bdms ?? [];
  const teamLeaders = (users as { username: string; role: string; team_id?: string }[]).filter((u) => u.role === "team_leader" && u.team_id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTeams((data?.teams ?? []) as { team_id: string; team_name: string; bdm: string }[]);
  }, [data?.teams]);

  const byTeam = teams.reduce((acc: Record<string, { team_name: string; bdms: string[] }>, t) => {
    if (!acc[t.team_id]) acc[t.team_id] = { team_name: t.team_name, bdms: [] };
    acc[t.team_id].bdms.push(t.bdm);
    return acc;
  }, {});
  const teamIds = Object.keys(byTeam);

  function addTeam() {
    const id = prompt("Team ID (e.g. sales-1):");
    if (!id?.trim()) return;
    const name = prompt("Team name:") || id;
    if (!byTeam[id.trim()]) {
      setTeams((prev) => [...prev, { team_id: id.trim(), team_name: name, bdm: bdms[0] || "" }]);
    }
  }

  function addBdmToTeam(teamId: string) {
    const bdm = prompt("BDM name (must exist in Config):");
    if (!bdm?.trim()) return;
    const teamName = byTeam[teamId]?.team_name || teamId;
    setTeams((prev) => [...prev, { team_id: teamId, team_name: teamName, bdm: bdm.trim() }]);
  }

  function removeBdm(teamId: string, bdm: string) {
    setTeams((prev) => prev.filter((t) => !(t.team_id === teamId && t.bdm === bdm)));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teams }),
      });
      mutate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold text-white">Teams – Assign BDMs & Team Leaders</h2>
      <p className="text-sm text-slate-400">
        Create teams and assign BDMs. Assign Team Leaders in the Users tab (select their team). TLs see only leads for BDMs in their team.
      </p>
      <div className="space-y-4">
        {teamIds.map((tid) => (
          <div key={tid} className="rounded-lg border border-slate-600 bg-slate-800/50 p-3">
            <div className="font-medium text-white">{tid} – {byTeam[tid].team_name}</div>
            {teamLeaders.filter((tl) => tl.team_id === tid).length > 0 && (
              <div className="mt-1 text-xs text-slate-400">
                Team Leader(s): {teamLeaders.filter((tl) => tl.team_id === tid).map((tl) => tl.username).join(", ")}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {byTeam[tid].bdms.map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center gap-1 rounded bg-slate-600 px-2 py-1 text-sm"
                >
                  {b}
                  <button
                    type="button"
                    onClick={() => removeBdm(tid, b)}
                    className="text-red-400 hover:text-red-300"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => addBdmToTeam(tid)}
                className="text-sky-400 hover:underline text-sm"
              >
                + Add BDM
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={addTeam} className="btn-secondary">
          Add Team
        </button>
        <button onClick={handleSave} className="btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

const IMPORT_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "city", label: "City", required: true },
  { key: "company", label: "Company" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "insta_id", label: "Insta ID" },
  { key: "bdm", label: "BDM", required: true },
  { key: "plan", label: "Plan" },
  { key: "status", label: "Status" },
  { key: "remarks", label: "Remarks" },
  { key: "connected_on", label: "Connected On" },
  { key: "next_follow_up", label: "Next Follow Up" },
  { key: "committed_date", label: "Committed Date" },
  { key: "original_price", label: "Original Price" },
  { key: "discount", label: "Discount" },
  { key: "amount_paid", label: "Amount Paid" },
  { key: "payment_status", label: "Payment Status" },
  { key: "payment_mode", label: "Payment Mode" },
];

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQuotes = !inQuotes;
      else if ((c === "," || c === "\t") && !inQuotes) {
        parts.push(current.trim());
        current = "";
      } else current += c;
    }
    parts.push(current.trim());
    return parts;
  });
}

function ImportTab() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ imported?: number; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"upload" | "mapping" | "done">("upload");

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFile(f ?? null);
    setResult(null);
    setStep("upload");
    if (!f) return;
    const text = await f.text();
    const parsed = parseCSV(text);
    setRows(parsed);
    if (parsed.length > 0) {
      const numCols = Math.max(1, ...parsed.map((r) => r.length));
      const defaultMap: Record<string, number> = {};
      IMPORT_FIELDS.forEach((f, i) => {
        defaultMap[f.key] = Math.min(i, numCols - 1);
      });
      setMapping(defaultMap);
      setStep("mapping");
    }
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mapping }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ imported: data.imported });
        setStep("done");
      } else {
        setResult({ error: data.error });
      }
    } catch (err) {
      setResult({ error: String(err) });
    } finally {
      setLoading(false);
    }
  }

  const headers = rows[0] ?? [];
  const numCols = rows.length ? Math.max(...rows.map((r) => r.length)) : 0;
  const previewRows = rows.slice(0, 4);

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold text-white">Import Leads (CSV)</h2>
      <details className="text-sm text-slate-400">
        <summary className="cursor-pointer text-sky-400 hover:text-sky-300">Format reference</summary>
        <p className="mt-2 text-xs">Columns (comma or tab): name, city, company, email, phone, insta_id, bdm, plan, status, remarks, connected_on, next_follow_up, committed_date, original_price, discount, amount_paid, payment_status, payment_mode. Required: name, city, bdm. Plan optional. Status: UNTOUCHED|CONTACTED|FOLLOW UP/DETAILS SHARED|CONFIRMED|PARTLY_PAID|PAID|DENIED.</p>
      </details>
      <div>
        <label className="mb-1 block text-sm text-slate-400">1. Upload CSV</label>
        <input
          type="file"
          accept=".csv,.txt"
          onChange={handleFileChange}
          className="text-sm text-slate-400"
        />
      </div>
      {step === "mapping" && (
        <>
          <div>
            <h3 className="mb-2 text-sm font-medium text-white">2. Map columns to fields</h3>
            <p className="mb-2 text-xs text-slate-500">Select which CSV column (0-indexed) maps to each field.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <label className="w-24 text-sm text-slate-400 shrink-0">{f.label}</label>
                    <select
                    value={mapping[f.key] ?? (f.required ? 0 : -1)}
                    onChange={(e) =>
                      setMapping((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))
                    }
                    className="input text-sm py-1 w-16"
                  >
                    {!f.required && (
                      <option value={-1}>— Skip</option>
                    )}
                    {Array.from({ length: numCols || 1 }, (_, i) => (
                      <option key={i} value={i}>
                        Col {i}: {String(headers[i] ?? "").slice(0, 15) || "—"}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-white">Preview</h3>
            <div className="max-h-24 overflow-auto text-xs text-slate-400">
              <table className="w-full">
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i}>
                      {r.slice(0, 6).map((c, j) => (
                        <td key={j} className="border border-slate-600 px-2 py-1">
                          {String(c).slice(0, 20)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <button
            onClick={handleImport}
            className="btn-primary"
            disabled={loading}
          >
            {loading ? "Importing..." : "3. Import"}
          </button>
        </>
      )}
      {result?.imported != null && (
        <p className="text-emerald-400">Imported {result.imported} leads</p>
      )}
      {result?.error && <p className="text-red-400">{result.error}</p>}
    </div>
  );
}
