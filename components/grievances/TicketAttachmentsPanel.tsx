"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  MAX_TICKET_ATTACHMENTS,
  MAX_TICKET_ATTACHMENT_BYTES,
  TICKET_ATTACHMENT_ACCEPT,
} from "@/lib/ticket-attachments";
import { formatDate } from "@/lib/utils";

type Attachment = {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  attachmentCategory: string | null;
  visibility: string;
  createdAt: string;
};

export function TicketAttachmentsPanel({ ticketId }: { ticketId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    void fetch(`/api/crm/tickets/${ticketId}/attachments`)
      .then((r) => r.json())
      .then((json) => setRows(json.data ?? []))
      .catch(() => {
        toast("Could not load attachments. Restart dev server if this persists.", "error");
      });
  }, [ticketId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const remaining = MAX_TICKET_ATTACHMENTS - rows.length;

  const uploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;

    if (files.length > remaining) {
      toast(`Only ${remaining} more file(s) allowed on this ticket`, "error");
      return;
    }

    for (const file of files) {
      if (file.size > MAX_TICKET_ATTACHMENT_BYTES) {
        toast(`${file.name} exceeds 10 MB limit`, "error");
        return;
      }
    }

    setUploading(true);
    let uploaded = 0;
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      form.append("category", "staff_document");
      form.append("visibility", "internal");

      const res = await fetch(`/api/crm/tickets/${ticketId}/attachments`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? `Failed to upload ${file.name}`, "error");
        break;
      }
      uploaded += 1;
    }
    setUploading(false);
    if (uploaded > 0) {
      toast(`${uploaded} file(s) attached`);
      load();
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-brand">Documents</h2>
        <span className="text-xs text-slate-muted">
          {rows.length}/{MAX_TICKET_ATTACHMENTS} files
        </span>
      </div>

      {remaining > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs text-slate-muted">
            Attach contracts, screenshots, ledger exports, or internal proof (PDF, images, Word, Excel — 10 MB each)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={TICKET_ATTACHMENT_ACCEPT}
            disabled={uploading}
            className="block w-full text-xs text-slate-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
            onChange={(e) => {
              if (e.target.files?.length) void uploadFiles(e.target.files);
            }}
          />
          {uploading && <p className="text-xs text-slate-muted">Uploading…</p>}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-muted">No documents yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-3 py-2"
            >
              <div>
                <a
                  href={a.filePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent hover:underline"
                >
                  {a.fileName}
                </a>
                <span className="ml-2 text-xs text-slate-muted">{formatDate(a.createdAt)}</span>
              </div>
              <div className="flex gap-1">
                {a.attachmentCategory && a.attachmentCategory !== "general" && (
                  <Badge variant="muted">{a.attachmentCategory.replace(/_/g, " ")}</Badge>
                )}
                <Badge variant={a.visibility === "mua_visible" ? "hot" : "muted"}>
                  {a.visibility === "mua_visible" ? "MUA visible" : "Internal"}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
