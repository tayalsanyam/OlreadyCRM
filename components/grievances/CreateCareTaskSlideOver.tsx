"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SlideOver } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import { StaffPicker } from "@/components/grievances/StaffPicker";
import type { CareTaskPriority, CareTaskType } from "@/lib/types";

const TASK_TYPES: { value: CareTaskType; label: string }[] = [
  { value: "callBack", label: "Call back" },
  { value: "gatherData", label: "Gather data" },
  { value: "verifyLead", label: "Verify lead" },
  { value: "attachProof", label: "Attach proof" },
  { value: "attachLedger", label: "Attach ledger" },
  { value: "attachContract", label: "Attach contract / invoice" },
  { value: "rmInput", label: "RM input" },
  { value: "salesInput", label: "Sales input" },
  { value: "rmMuaResolution", label: "RM MUA resolution" },
  { value: "draftResponse", label: "Draft response" },
  { value: "adminReview", label: "Admin review" },
  { value: "sendEmail", label: "Send email" },
];

const TASK_TITLE_DEFAULTS: Record<CareTaskType, string> = {
  callBack: "Call back",
  gatherData: "Gather data",
  verifyLead: "Verify lead",
  attachProof: "Attach proof",
  attachLedger: "Attach ledger",
  attachContract: "Attach contract / invoice",
  rmInput: "RM input",
  salesInput: "Sales input",
  rmMuaResolution: "RM MUA resolution",
  draftResponse: "Draft response",
  adminReview: "Admin review",
  sendEmail: "Send email",
};

type Props = {
  ticketId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function CreateCareTaskSlideOver({ ticketId, open, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    taskType: "gatherData" as CareTaskType,
    title: TASK_TITLE_DEFAULTS.gatherData,
    description: "",
    assignedTo: "",
    priority: "normal" as CareTaskPriority,
    dueAt: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      taskType: "gatherData",
      title: TASK_TITLE_DEFAULTS.gatherData,
      description: "",
      assignedTo: "",
      priority: "normal",
      dueAt: "",
    });
  }, [open]);

  const submit = async () => {
    if (!form.title.trim()) {
      toast("Title is required", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/crm/care-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId,
          taskType: form.taskType,
          title: form.title.trim(),
          description: form.description || undefined,
          assignedTo: form.assignedTo || undefined,
          priority: form.priority,
          dueAt: form.dueAt || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(typeof json.error === "string" ? json.error : "Failed to create task", "error");
        return;
      }
      toast(`Task ${json.data?.displayId ?? ""} created`);
      onCreated();
      onClose();
    } catch {
      toast("Failed to create task — check connection and try again", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SlideOver open={open} onClose={onClose} title="Assign care task">
      <div className="space-y-4 p-4">
        <Select
          label="Task type"
          value={form.taskType}
          onChange={(e) => {
            const taskType = e.target.value as CareTaskType;
            setForm({
              ...form,
              taskType,
              title: form.title === TASK_TITLE_DEFAULTS[form.taskType] ? TASK_TITLE_DEFAULTS[taskType] : form.title,
            });
          }}
          options={TASK_TYPES.map((t) => ({ value: t.value, label: t.label }))}
        />
        <Input
          label="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <StaffPicker
          value={form.assignedTo}
          onChange={(assignedTo) => setForm({ ...form, assignedTo })}
        />
        <Select
          label="Priority"
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value as CareTaskPriority })}
          options={[
            { value: "critical", label: "Critical" },
            { value: "high", label: "High" },
            { value: "normal", label: "Normal" },
            { value: "low", label: "Low" },
          ]}
        />
        <Input
          label="Due date"
          type="datetime-local"
          value={form.dueAt}
          onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
        />
        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <Button onClick={submit} disabled={loading} className="w-full">
          {loading ? "Creating…" : "Create task"}
        </Button>
      </div>
    </SlideOver>
  );
}
