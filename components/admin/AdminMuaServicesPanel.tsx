"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  baseAmount: number | null;
  sortOrder: number;
  active: boolean;
};

export function AdminMuaServicesPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [baseAmount, setBaseAmount] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    void fetch("/api/admin/mua-services")
      .then((r) => r.json())
      .then((j: { data?: Row[] }) => setRows(j.data ?? []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleRows = useMemo(
    () => (showInactive ? rows : rows.filter((r) => r.active)),
    [rows, showInactive],
  );

  async function addService() {
    if (!name.trim()) return;
    await fetch("/api/admin/mua-services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        baseAmount: baseAmount.trim() ? Number(baseAmount) : null,
      }),
    });
    setName("");
    setBaseAmount("");
    load();
  }

  async function setActive(row: Row, active: boolean) {
    setBusyId(row.id);
    try {
      const res = await fetch("/api/admin/mua-services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, active }),
      });
      if (!res.ok) return;
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function removeService(row: Row) {
    const msg = row.active
      ? `Remove "${row.name}" from the catalog? It will disappear from MUA pickers. Existing MUAs keep it on their profile.`
      : `Permanently delete "${row.name}" from the catalog?`;
    if (!window.confirm(msg)) return;

    setBusyId(row.id);
    try {
      const res = await fetch(
        `/api/admin/mua-services?id=${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) return;
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-muted">
        Checklist options for MUA create/edit. Base amount is a reference — sales and backend RMs can
        override per MUA. Inactive services are hidden from pickers but stay on MUAs already using them.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Service name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          placeholder="Default base ₹"
          type="number"
          className="w-36"
          value={baseAmount}
          onChange={(e) => setBaseAmount(e.target.value)}
        />
        <Button variant="secondary" onClick={() => void addService()}>
          Add service
        </Button>
        <label className="flex items-center gap-2 text-sm text-slate-muted">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Service</TH>
            <TH>Default base ₹</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {visibleRows.length === 0 ? (
            <TR>
              <TD colSpan={4} className="py-6 text-center text-slate-muted">
                No services in catalog
              </TD>
            </TR>
          ) : (
            visibleRows.map((r) => (
              <TR key={r.id} className={cn(!r.active && "opacity-70")}>
                <TD className="font-medium">{r.name}</TD>
                <TD>{r.baseAmount != null ? r.baseAmount.toLocaleString("en-IN") : "—"}</TD>
                <TD>
                  <Badge variant={r.active ? "success" : "muted"}>
                    {r.active ? "Active" : "Inactive"}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {r.active ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === r.id}
                        onClick={() => void setActive(r, false)}
                      >
                        Mark inactive
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === r.id}
                        onClick={() => void setActive(r, true)}
                      >
                        Mark active
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-red-600 hover:text-red-700"
                      disabled={busyId === r.id}
                      onClick={() => void removeService(r)}
                    >
                      Remove
                    </Button>
                  </div>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
