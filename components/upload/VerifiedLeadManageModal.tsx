"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { Region } from "@/lib/types";

type RoutingTarget = "portal" | "rm_queue" | "commission";

interface RmOption {
  id: string;
  name: string;
  region: string;
  regions?: string[];
}

interface CommissionRmOption {
  id: string;
  name: string;
}

function rmMatchesRegion(r: RmOption, leadRegion: string | null) {
  if (!leadRegion) return false;
  const regions = r.regions?.length ? r.regions : [r.region];
  return regions.includes(leadRegion);
}

export function VerifiedLeadManageModal({
  open,
  onClose,
  leadId,
  brideName,
  region,
  portalOnly,
  status,
  assignedRmId,
  assignedRmName,
  onSaved,
  onDeactivated,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  brideName: string;
  region: Region;
  portalOnly?: boolean;
  status: string;
  assignedRmId?: string | null;
  assignedRmName?: string | null;
  onSaved: () => void;
  onDeactivated?: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"menu" | "deactivate">("menu");
  const [note, setNote] = useState("");
  const [rms, setRms] = useState<RmOption[]>([]);
  const [commissionRms, setCommissionRms] = useState<CommissionRmOption[]>([]);
  const [selectedRmId, setSelectedRmId] = useState("");
  const [selectedCommissionRmId, setSelectedCommissionRmId] = useState("");

  const isCommission = status === "commissionRm";

  const loadRms = useCallback(() => {
    void fetch("/api/upload/rms")
      .then((r) => r.json())
      .then((json: { data: RmOption[] }) => setRms(json.data ?? []));
    void fetch("/api/staff/commission-rms")
      .then((r) => r.json())
      .then((json: { data: CommissionRmOption[] }) =>
        setCommissionRms(json.data ?? [])
      );
  }, []);

  useEffect(() => {
    if (open) {
      loadRms();
      setSelectedRmId(isCommission ? "" : (assignedRmId ?? ""));
      setSelectedCommissionRmId(isCommission ? (assignedRmId ?? "") : "");
      setMode("menu");
      setNote("");
    }
  }, [open, assignedRmId, isCommission, loadRms]);

  async function post(
    body: Record<string, unknown>,
    opts?: { skipSaved?: boolean }
  ): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(`/api/upload/leads/${leadId}/manage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string | null; data?: { rmName?: string } };
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      if (!opts?.skipSaved) onSaved();
      onClose();
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changeRouting(target: RoutingTarget) {
    if (target === "commission") {
      if (!selectedCommissionRmId) {
        toast("Select a Commission RM");
        return;
      }
      const ok = await post({
        action: "set_routing",
        target,
        commissionRmId: selectedCommissionRmId,
      });
      if (!ok) return;
      const rm = commissionRms.find((r) => r.id === selectedCommissionRmId);
      toast(rm ? `Assigned to ${rm.name}` : "Moved to commission queue");
      return;
    }

    const ok = await post({ action: "set_routing", target });
    if (!ok) return;
    toast(
      target === "portal"
        ? "Moved to portal"
        : "Moved to RM assign queue"
    );
  }

  async function assignRm() {
    if (!selectedRmId) {
      toast("Select a regional RM");
      return;
    }
    const ok = await post({ action: "assign_rm", rmId: selectedRmId });
    if (!ok) return;
    const rm = regionRms.find((r) => r.id === selectedRmId);
    toast(rm ? `Assigned to ${rm.name}` : "RM assigned");
  }

  async function assignCommissionRm() {
    if (!selectedCommissionRmId) {
      toast("Select a Commission RM");
      return;
    }
    const ok = await post({
      action: isCommission ? "assign_commission_rm" : "set_routing",
      ...(isCommission
        ? { commissionRmId: selectedCommissionRmId }
        : { target: "commission", commissionRmId: selectedCommissionRmId }),
    });
    if (!ok) return;
    const rm = commissionRms.find((r) => r.id === selectedCommissionRmId);
    toast(rm ? `Assigned to ${rm.name}` : "Commission RM assigned");
  }

  const regionRms = rms.filter((r) => rmMatchesRegion(r, region));

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) {
          setMode("menu");
          setNote("");
          onClose();
        }
      }}
      title={mode === "deactivate" ? `Deactivate — ${brideName}` : `Manage — ${brideName}`}
    >
      {mode === "menu" ? (
        <div className="space-y-4">
          {!isCommission && !portalOnly ? (
            <div>
              <p className="mb-2 text-sm font-medium text-brand">Regional RM</p>
              {assignedRmName ? (
                <p className="mb-2 text-sm text-slate-muted">
                  Currently: <span className="font-medium text-slate-900">{assignedRmName}</span>
                </p>
              ) : (
                <p className="mb-2 text-sm text-slate-muted">Not assigned to an RM yet.</p>
              )}
              {regionRms.length > 0 ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
                    <span className="text-slate-muted">Assign / change RM</span>
                    <select
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={selectedRmId}
                      disabled={busy}
                      onChange={(e) => setSelectedRmId(e.target.value)}
                    >
                      <option value="">Select RM…</option>
                      {regionRms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    size="sm"
                    disabled={busy || !selectedRmId || selectedRmId === assignedRmId}
                    onClick={() => void assignRm()}
                  >
                    {assignedRmId ? "Change RM" : "Assign RM"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-amber-700">No active RM covers the {region} region.</p>
              )}
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium text-brand">Commission RM</p>
            {isCommission && assignedRmName ? (
              <p className="mb-2 text-sm text-slate-muted">
                Currently: <span className="font-medium text-slate-900">{assignedRmName}</span>
              </p>
            ) : (
              <p className="mb-2 text-sm text-slate-muted">
                {isCommission
                  ? "Not assigned to a Commission RM yet."
                  : "Move this lead to a Commission RM queue."}
              </p>
            )}
            {commissionRms.length > 0 ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
                  <span className="text-slate-muted">
                    {isCommission ? "Assign / change Commission RM" : "Select Commission RM"}
                  </span>
                  <select
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={selectedCommissionRmId}
                    disabled={busy}
                    onChange={(e) => setSelectedCommissionRmId(e.target.value)}
                  >
                    <option value="">Select Commission RM…</option>
                    {commissionRms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  size="sm"
                  disabled={
                    busy ||
                    !selectedCommissionRmId ||
                    (isCommission && selectedCommissionRmId === assignedRmId)
                  }
                  onClick={() => void assignCommissionRm()}
                >
                  {isCommission ? "Change Commission RM" : "Move to commission"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-amber-700">No active Commission RMs found.</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-brand">Change routing</p>
            <div className="flex flex-wrap gap-2">
              {!portalOnly && !isCommission ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void changeRouting("portal")}
                >
                  Move to portal
                </Button>
              ) : null}
              {portalOnly || isCommission ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void changeRouting("rm_queue")}
                >
                  Move to RM queue
                </Button>
              ) : null}
            </div>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <Button
              size="sm"
              variant="ghost"
              className="text-red-700 hover:bg-red-50"
              disabled={busy}
              onClick={() => setMode("deactivate")}
            >
              Deactivate lead
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-muted">
            Archives this lead and removes it from verified routing. Add an optional note for the
            team.
          </p>
          <Input
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for deactivation"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setMode("menu")}>
              Back
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void post(
                  {
                    action: "deactivate",
                    note: note.trim() || undefined,
                  },
                  { skipSaved: true }
                ).then((ok) => {
                  if (!ok) return;
                  toast("Lead deactivated");
                  onDeactivated?.();
                  onSaved();
                })
              }
            >
              Deactivate
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
