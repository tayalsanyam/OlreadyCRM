"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { OPS_TASK_ATTACHMENT_ACCEPT } from "@/lib/ops-task-attachments";
import { useToast } from "@/components/ui/Toast";

type Attachment = {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  createdAt: string;
  uploadedByName?: string;
};

export function OpsTaskAttachmentsPanel({
  taskId,
  canUpload,
  refreshKey = 0,
}: {
  taskId: string;
  canUpload: boolean;
  refreshKey?: number;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    void fetch(`/api/ops-tasks/${taskId}/attachments`)
      .then((r) => r.json())
      .then((j) => setRows(j.data ?? []))
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function upload(file: File) {
    setUploading(true);
    const form = new FormData();
    form.set("file", file);
    const res = await fetch(`/api/ops-tasks/${taskId}/attachments`, {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    setUploading(false);
    if (!res.ok) {
      toast(json.error ?? "Upload failed", "error");
      return;
    }
    toast("File attached");
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-brand">Attachments</h2>
        {canUpload && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              multiple
              accept={OPS_TASK_ATTACHMENT_ACCEPT}
              onChange={(e) => {
                const list = e.target.files ? [...e.target.files] : [];
                if (list.length) void Promise.all(list.map((f) => upload(f)));
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Add file"}
            </Button>
          </>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-slate-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-muted">No files attached.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
              <a
                href={a.filePath}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent hover:underline"
              >
                {a.fileName}
              </a>
              <span className="shrink-0 text-xs text-slate-muted">
                {a.uploadedByName ? `${a.uploadedByName} · ` : ""}
                {new Date(a.createdAt).toLocaleDateString("en-IN")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Upload files for a task (assignee, assigner, or admin). */
export async function uploadOpsTaskAttachments(
  taskId: string,
  files: File[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const file of files) {
    const form = new FormData();
    form.set("file", file);
    const res = await fetch(`/api/ops-tasks/${taskId}/attachments`, { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: (json as { error?: string }).error ?? `Failed to upload ${file.name}`,
      };
    }
  }
  return { ok: true };
}
