"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SlideOver } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import { StaffPicker } from "@/components/grievances/StaffPicker";
import { OPS_TASK_ATTACHMENT_ACCEPT } from "@/lib/ops-task-attachments";
import { uploadOpsTaskAttachments } from "@/components/ops/OpsTaskAttachmentsPanel";

type MuaHit = { id: string; displayId: string; name: string; phone: string | null; city: string | null };
type BrideHit = { id: string; displayId: string; brideName: string; phone: string | null; city: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultAssignedTo?: string;
  parentTaskId?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultMuaId?: string | null;
  defaultMuaLabel?: string;
  defaultLeadId?: string | null;
  defaultLeadLabel?: string;
  createApiPath?: string;
};

export function CreateOpsTaskSlideOver({
  open,
  onClose,
  onCreated,
  defaultAssignedTo = "",
  parentTaskId,
  defaultTitle = "",
  defaultDescription = "",
  defaultMuaId,
  defaultMuaLabel = "",
  defaultLeadId,
  defaultLeadLabel = "",
  createApiPath = "/api/ops-tasks",
}: Props) {
  const { toast } = useToast();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState(defaultAssignedTo);
  const [dueAt, setDueAt] = useState("");
  const [muaId, setMuaId] = useState<string | null>(defaultMuaId ?? null);
  const [leadId, setLeadId] = useState<string | null>(defaultLeadId ?? null);
  const [muaSearch, setMuaSearch] = useState("");
  const [brideSearch, setBrideSearch] = useState("");
  const [muaHits, setMuaHits] = useState<MuaHit[]>([]);
  const [brideHits, setBrideHits] = useState<BrideHit[]>([]);
  const [muaLabel, setMuaLabel] = useState("");
  const [brideLabel, setBrideLabel] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setDescription(defaultDescription);
    setAssignedTo(defaultAssignedTo);
    setDueAt("");
    setMuaId(defaultMuaId ?? null);
    setLeadId(defaultLeadId ?? null);
    setMuaSearch("");
    setBrideSearch("");
    setMuaLabel(defaultMuaLabel);
    setBrideLabel(defaultLeadLabel);
    setPendingFiles([]);
  }, [
    open,
    defaultTitle,
    defaultDescription,
    defaultAssignedTo,
    defaultMuaId,
    defaultMuaLabel,
    defaultLeadId,
    defaultLeadLabel,
  ]);

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const searchMua = useCallback(() => {
    if (muaSearch.trim().length < 2) {
      setMuaHits([]);
      return;
    }
    void fetch(`/api/ops-tasks?type=mua&q=${encodeURIComponent(muaSearch)}`)
      .then((r) => r.json())
      .then((j) => setMuaHits(j.data?.muas ?? []));
  }, [muaSearch]);

  const searchBride = useCallback(() => {
    if (brideSearch.trim().length < 2) {
      setBrideHits([]);
      return;
    }
    void fetch(`/api/ops-tasks?type=bride&q=${encodeURIComponent(brideSearch)}`)
      .then((r) => r.json())
      .then((j) => setBrideHits(j.data?.brides ?? []));
  }, [brideSearch]);

  useEffect(() => {
    const t = setTimeout(searchMua, 300);
    return () => clearTimeout(t);
  }, [searchMua]);

  useEffect(() => {
    const t = setTimeout(searchBride, 300);
    return () => clearTimeout(t);
  }, [searchBride]);

  const submit = async () => {
    if (!title.trim()) {
      toast("Title is required", "error");
      return;
    }
    if (!assignedTo) {
      toast("Select who to assign this task to", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(createApiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description || undefined,
          assignedTo,
          muaId,
          leadId,
          dueAt: dueAt || undefined,
          parentTaskId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to create task", "error");
        return;
      }
      const taskId = json.data?.id as string | undefined;
      if (taskId && pendingFiles.length) {
        const uploadResult = await uploadOpsTaskAttachments(taskId, pendingFiles);
        if (!uploadResult.ok) {
          toast(
            uploadResult.error ?? "Task created but files could not be attached",
            "error",
          );
          onCreated();
          onClose();
          return;
        }
      }
      toast(`Task ${json.data?.displayId ?? ""} created`);
      onCreated();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={
        parentTaskId
          ? "Assign follow-up task"
          : defaultDescription
            ? "Create assignment task"
            : "Create task"
      }
    >
      <div className="space-y-4 p-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <StaffPicker
          value={assignedTo}
          onChange={setAssignedTo}
          label="Assign to"
          allowUnassigned={false}
          emptyLabel="Select employee…"
        />
        <Input
          label="Due date"
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
        />

        <div>
          <label className="mb-1 block text-sm font-medium">Link MUA (optional)</label>
          {muaId ? (
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span>{muaLabel || muaId}</span>
              <button type="button" className="text-xs text-red-600" onClick={() => { setMuaId(null); setMuaLabel(""); }}>
                Clear
              </button>
            </div>
          ) : (
            <>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Search MUA name, ID, or phone…"
                value={muaSearch}
                onChange={(e) => setMuaSearch(e.target.value)}
              />
              {muaHits.length > 0 && (
                <ul className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-100">
                  {muaHits.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => {
                          setMuaId(m.id);
                          setMuaLabel(`${m.displayId} · ${m.name}`);
                          setMuaHits([]);
                          setMuaSearch("");
                        }}
                      >
                        {m.displayId} · {m.name} · {m.city ?? "—"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Link bride lead (optional)</label>
          {leadId ? (
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span>{brideLabel || leadId}</span>
              <button type="button" className="text-xs text-red-600" onClick={() => { setLeadId(null); setBrideLabel(""); }}>
                Clear
              </button>
            </div>
          ) : (
            <>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Search bride name, lead ID, or phone…"
                value={brideSearch}
                onChange={(e) => setBrideSearch(e.target.value)}
              />
              {brideHits.length > 0 && (
                <ul className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-100">
                  {brideHits.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => {
                          setLeadId(b.id);
                          setBrideLabel(`${b.displayId} · ${b.brideName}`);
                          setBrideHits([]);
                          setBrideSearch("");
                        }}
                      >
                        {b.displayId} · {b.brideName} · {b.city ?? "—"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Instructions</label>
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-brand">Attachments (optional)</p>
              <p className="text-xs text-slate-muted">
                PDF, images, Word, Excel, or text — up to 10 MB each
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              multiple
              accept={OPS_TASK_ATTACHMENT_ACCEPT}
              onChange={(e) => {
                const list = e.target.files ? [...e.target.files] : [];
                if (list.length) setPendingFiles((prev) => [...prev, ...list]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
            >
              Choose files
            </Button>
          </div>
          {pendingFiles.length > 0 ? (
            <ul className="space-y-1">
              {pendingFiles.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-sm"
                >
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-red-600 hover:underline"
                    onClick={() => removeFile(i)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-muted">No files selected yet.</p>
          )}
        </div>

        <Button onClick={submit} disabled={loading} className="w-full">
          {loading ? "Creating…" : "Create task"}
        </Button>
      </div>
    </SlideOver>
  );
}
