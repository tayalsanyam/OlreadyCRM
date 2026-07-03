"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  getTicketCategoriesForRaisedBy,
  TICKET_CATEGORY_LABELS,
  formatTicketCategories,
} from "@/lib/ticket-categories";
import type { TicketCategoryDef } from "@/lib/ticket-categories";
import type { RaisedByType } from "@/lib/types";
import {
  MAX_INTAKE_ATTACHMENTS,
  MAX_TICKET_ATTACHMENT_BYTES,
  TICKET_ATTACHMENT_ACCEPT,
} from "@/lib/ticket-attachments";
import { ticketStatusLabel } from "@/lib/ticket-status";
import { cn, formatDate } from "@/lib/utils";

type PendingTicket = {
  id: string;
  ticketNumber: string;
  category: string;
  status: string;
  urgency: string;
  createdAt: string;
};

type LeadMatch = {
  leadId: string;
  displayId: string;
  brideName: string;
  phone: string | null;
  region: string | null;
  pendingTickets: PendingTicket[];
};

type MuaMatch = {
  muaId: string;
  displayId: string;
  name: string;
  phone: string | null;
  alternatePhone: string | null;
  email: string | null;
  whatsapp: string | null;
  city: string | null;
  planTier: string | null;
  pendingTickets: PendingTicket[];
};

export type CreateTicketFormProps = {
  initialMuaId?: string;
  initialLeadId?: string;
  initialRaisedByType?: "bride" | "mua";
  initialName?: string;
  initialPhone?: string | null;
  initialEmail?: string | null;
  sendAck?: boolean;
  submitLabel?: string;
  onCreated?: (ticket: { id: string; ticketNumber: string }) => void;
  onCancel?: () => void;
};


export function CreateTicketForm({
  initialMuaId,
  initialLeadId,
  initialRaisedByType = "mua",
  initialName = "",
  initialPhone = "",
  initialEmail = "",
  sendAck = true,
  submitLabel = "Create ticket",
  onCreated,
  onCancel,
}: CreateTicketFormProps) {
  const { toast } = useToast();
  const typeLocked = Boolean(initialMuaId) || Boolean(initialLeadId);
  const [raisedByType, setRaisedByType] = useState<RaisedByType>(initialRaisedByType);
  const [categories, setCategories] = useState<string[]>(["other"]);
  const [raisedByName, setRaisedByName] = useState(initialName);
  const [raisedByPhone, setRaisedByPhone] = useState(initialPhone ?? "");
  const [raisedByEmail, setRaisedByEmail] = useState(initialEmail ?? "");
  const [complaintText, setComplaintText] = useState("");
  const [muaId, setMuaId] = useState(initialMuaId ?? "");
  const [leadId, setLeadId] = useState(initialLeadId ?? "");
  const [categoryDefs, setCategoryDefs] = useState<TicketCategoryDef[]>(
    getTicketCategoriesForRaisedBy(raisedByType)
  );
  const [matches, setMatches] = useState<MuaMatch[]>([]);
  const [leadMatches, setLeadMatches] = useState<LeadMatch[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MuaMatch | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadMatch | null>(null);
  const [orphanPending, setOrphanPending] = useState<PendingTicket[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyMatch = useCallback((match: MuaMatch) => {
    setSelectedMatch(match);
    setMuaId(match.muaId);
    setRaisedByName(match.name);
    if (match.phone) setRaisedByPhone(match.phone);
    if (match.email) setRaisedByEmail(match.email);
  }, []);

  const applyLeadMatch = useCallback((match: LeadMatch) => {
    setSelectedLead(match);
    setLeadId(match.leadId);
    setRaisedByName(match.brideName);
    if (match.phone) setRaisedByPhone(match.phone);
  }, []);

  const runLookup = useCallback(
    (overrides?: Partial<{ name: string; phone: string; email: string; muaId: string; leadId: string }>) => {
      const name = overrides?.name ?? raisedByName;
      const phone = overrides?.phone ?? raisedByPhone;
      const email = overrides?.email ?? raisedByEmail;
      const id = overrides?.muaId ?? muaId;
      const brideId = overrides?.leadId ?? leadId;

      const params = new URLSearchParams();
      params.set("raisedByType", raisedByType);

      if (raisedByType === "bride") {
        if (brideId) params.set("leadId", brideId);
        else {
          if (name.trim().length >= 2) params.set("name", name.trim());
          if (phone.replace(/\D/g, "").length >= 10) params.set("phone", phone.trim());
          if (email.includes("@")) params.set("email", email.trim());
        }

        if ([...params.keys()].length <= 1) {
          setLeadMatches([]);
          setSelectedLead(null);
          setOrphanPending([]);
          return;
        }

        setLookupLoading(true);
        void fetch(`/api/crm/tickets/intake-lookup?${params}`)
          .then((r) => r.json())
          .then((json) => {
            const list = (json.data?.leadMatches ?? []) as LeadMatch[];
            const orphan = (json.data?.orphanPending ?? []) as PendingTicket[];
            setLeadMatches(list);
            setOrphanPending(orphan);
            if (brideId && list[0]) {
              applyLeadMatch(list[0]!);
            } else if (list.length === 1 && phone.replace(/\D/g, "").length >= 10) {
              applyLeadMatch(list[0]!);
            }
          })
          .finally(() => setLookupLoading(false));
        return;
      }

      if (id) params.set("muaId", id);
      else {
        if (name.trim().length >= 2) params.set("name", name.trim());
        if (phone.replace(/\D/g, "").length >= 10) params.set("phone", phone.trim());
        if (email.includes("@")) params.set("email", email.trim());
      }

      if ([...params.keys()].length <= 1) {
        setMatches([]);
        setSelectedMatch(null);
        setOrphanPending([]);
        return;
      }

      setLookupLoading(true);
      void fetch(`/api/crm/tickets/intake-lookup?${params}`)
        .then((r) => r.json())
        .then((json) => {
          const list = (json.data?.matches ?? []) as MuaMatch[];
          const orphan = (json.data?.orphanPending ?? []) as PendingTicket[];
          setMatches(list);
          setOrphanPending(orphan);
          if (id && list[0]) {
            applyMatch(list[0]!);
          } else if (list.length === 1 && phone.replace(/\D/g, "").length >= 10) {
            applyMatch(list[0]!);
          }
        })
        .finally(() => setLookupLoading(false));
    },
    [raisedByName, raisedByPhone, raisedByEmail, muaId, leadId, raisedByType, applyMatch, applyLeadMatch]
  );

  useEffect(() => {
    void fetch(`/api/crm/tickets/categories?raisedByType=${raisedByType}`)
      .then((r) => r.json())
      .then((json) => {
        const list = (json.data?.categories ?? []) as TicketCategoryDef[];
        if (list.length) {
          setCategoryDefs(list);
          setCategories([list[0]?.value ?? "other"]);
          return;
        }
        const fallback = getTicketCategoriesForRaisedBy(raisedByType);
        setCategoryDefs(fallback);
        setCategories([fallback[0]?.value ?? "other"]);
      })
      .catch(() => {
        const fallback = getTicketCategoriesForRaisedBy(raisedByType);
        setCategoryDefs(fallback);
        setCategories([fallback[0]?.value ?? "other"]);
      });
  }, [raisedByType]);

  useEffect(() => {
    if (initialMuaId) {
      runLookup({ muaId: initialMuaId });
    }
  }, [initialMuaId, runLookup]);

  useEffect(() => {
    if (initialLeadId) {
      runLookup({ leadId: initialLeadId });
    }
  }, [initialLeadId, runLookup]);

  useEffect(() => {
    if (raisedByType === "mua") {
      setLeadMatches([]);
      setSelectedLead(null);
      setLeadId("");
    } else if (raisedByType === "bride") {
      setMatches([]);
      setSelectedMatch(null);
      setMuaId("");
    }
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(() => runLookup(), 350);
    return () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
    };
  }, [raisedByName, raisedByPhone, raisedByEmail, raisedByType, runLookup]);

  const toggleCategory = (value: string) => {
    setCategories((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((c) => c !== value);
        return next.length ? next : ["other"];
      }
      return [...prev.filter((c) => c !== "other"), value];
    });
  };

  const pendingTickets =
    raisedByType === "bride"
      ? selectedLead?.pendingTickets ??
        (leadMatches.length ? leadMatches.flatMap((m) => m.pendingTickets) : orphanPending)
      : selectedMatch?.pendingTickets ??
        (matches.length ? matches.flatMap((m) => m.pendingTickets) : orphanPending);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;

    const picked = Array.from(incoming);
    let skipped = 0;

    setFiles((prev) => {
      const merged = [...prev];
      for (const file of picked) {
        if (merged.length >= MAX_INTAKE_ATTACHMENTS) {
          skipped += 1;
          continue;
        }
        if (file.size > MAX_TICKET_ATTACHMENT_BYTES) {
          toast(`${file.name} is over 10 MB`, "error");
          continue;
        }
        const dup = merged.some((f) => f.name === file.name && f.size === file.size);
        if (!dup) merged.push(file);
      }
      return merged;
    });

    if (skipped > 0) {
      toast(`Maximum ${MAX_INTAKE_ATTACHMENTS} files per ticket`, "error");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadAttachments = async (ticketId: string) => {
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      form.append("category", "intake");
      form.append("visibility", "mua_visible");
      const res = await fetch(`/api/crm/tickets/${ticketId}/attachments`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast(json.error ?? `Failed to upload ${file.name}`, "error");
      }
    }
  };

  const submit = async () => {
    if (categories.length === 0) {
      toast("Select at least one issue type", "error");
      return;
    }
    if (complaintText.trim().length < 10) {
      toast("Complaint must be at least 10 characters", "error");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/crm/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categories,
        raisedByName: raisedByName.trim() || undefined,
        raisedByPhone: raisedByPhone.trim() || undefined,
        raisedByEmail: raisedByEmail.trim() || undefined,
        raisedByType,
        complaintText: complaintText.trim(),
        muaId: raisedByType === "mua" ? muaId || undefined : undefined,
        leadId: raisedByType === "bride" ? leadId || undefined : undefined,
        sendAck,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setLoading(false);
      toast(json.error ?? "Failed to create ticket", "error");
      return;
    }

    if (files.length > 0) {
      await uploadAttachments(json.data.id);
    }

    setLoading(false);
    toast(`Ticket created: ${json.data.ticketNumber}`);
    onCreated?.({ id: json.data.id, ticketNumber: json.data.ticketNumber });
  };

  return (
    <div className="space-y-5">
      {!typeLocked && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">I am raising this for</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["mua", "MUA / artist"],
                ["bride", "Bride / lead"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setRaisedByType(value);
                  setCategories([getTicketCategoriesForRaisedBy(value)[0]?.value ?? "other"]);
                  if (value === "bride") {
                    setSelectedMatch(null);
                    setMuaId("");
                  } else {
                    setSelectedLead(null);
                    setLeadId("");
                  }
                }}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                  raisedByType === value
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-slate-200 text-slate-muted hover:border-slate-300"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">
          Issue types{" "}
          <span className="font-normal text-slate-muted">(select all that apply)</span>
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {categoryDefs.map((cat) => {
            const checked = categories.includes(cat.value);
            return (
              <label
                key={cat.value}
                className={cn(
                  "flex cursor-pointer gap-2 rounded-lg border p-3 text-sm transition",
                  checked
                    ? "border-brand bg-brand/5"
                    : "border-slate-200 hover:border-slate-300"
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked}
                  onChange={() => toggleCategory(cat.value)}
                />
                <span>
                  <span className="font-medium">{cat.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-muted">{cat.description}</span>
                </span>
              </label>
            );
          })}
        </div>
        {categories.length > 1 && (
          <p className="mt-2 text-xs text-slate-muted">
            Primary category for SLA: {formatTicketCategories(categories)}
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
        <p className="text-sm font-medium text-brand">
          {raisedByType === "bride" ? "Bride / contact" : "Artist / contact"}
        </p>
        <Input
          label="Name"
          value={raisedByName}
          onChange={(e) => {
            setRaisedByName(e.target.value);
            if (raisedByType === "mua") {
              setSelectedMatch(null);
              setMuaId("");
            } else {
              setSelectedLead(null);
              setLeadId("");
            }
          }}
          placeholder={
            raisedByType === "bride" ? "Bride name" : "Search by MUA name…"
          }
        />
        <Input
          label="Phone"
          value={raisedByPhone}
          onChange={(e) => {
            setRaisedByPhone(e.target.value);
            if (raisedByType === "mua") {
              setSelectedMatch(null);
              setMuaId("");
            } else {
              setSelectedLead(null);
              setLeadId("");
            }
          }}
          placeholder={
            raisedByType === "bride"
              ? "10-digit mobile — auto-links lead"
              : "10-digit mobile — auto-links MUA"
          }
        />
        <Input
          label="Email"
          type="email"
          value={raisedByEmail}
          onChange={(e) => {
            setRaisedByEmail(e.target.value);
            if (raisedByType === "mua") {
              setSelectedMatch(null);
              setMuaId("");
            }
          }}
          placeholder={raisedByType === "bride" ? "Optional" : "Auto-fills when matched"}
        />

        {lookupLoading && (
          <p className="text-xs text-slate-muted">Searching CRM…</p>
        )}

        {raisedByType === "mua" && matches.length > 1 && !selectedMatch && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-muted">
              {matches.length} matches — pick the right artist:
            </p>
            <div className="max-h-52 overflow-y-auto overscroll-y-contain rounded-lg border border-slate-200 bg-white shadow-sm">
              {matches.map((m) => (
                <button
                  key={m.muaId}
                  type="button"
                  onClick={() => applyMatch(m)}
                  className="block w-full border-b border-slate-100 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-slate-50"
                >
                  <span className="font-medium text-brand">{m.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-muted">
                    {m.displayId} · {m.phone ?? "no phone"}
                    {m.city ? ` · ${m.city}` : ""}
                    {m.planTier ? ` · ${m.planTier.replace(/_/g, " ")}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {raisedByType === "mua" && selectedMatch && (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
            <p className="font-medium text-emerald-900">
              Linked: {selectedMatch.name}{" "}
              <span className="font-normal text-emerald-800">({selectedMatch.displayId})</span>
            </p>
            <p className="text-xs text-emerald-800">
              {[selectedMatch.city, selectedMatch.planTier?.replace(/_/g, " ")]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <button
              type="button"
              className="mt-1 text-xs text-emerald-700 underline"
              onClick={() => {
                setSelectedMatch(null);
                setMuaId("");
              }}
            >
              Clear link
            </button>
          </div>
        )}

        {raisedByType === "bride" && leadMatches.length > 1 && !selectedLead && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-muted">
              {leadMatches.length} matches — pick the right lead:
            </p>
            <div className="max-h-52 overflow-y-auto overscroll-y-contain rounded-lg border border-slate-200 bg-white shadow-sm">
              {leadMatches.map((m) => (
                <button
                  key={m.leadId}
                  type="button"
                  onClick={() => applyLeadMatch(m)}
                  className="block w-full border-b border-slate-100 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-slate-50"
                >
                  <span className="font-medium text-brand">{m.brideName}</span>
                  <span className="mt-0.5 block text-xs text-slate-muted">
                    {m.displayId} · {m.phone ?? "no phone"}
                    {m.region ? ` · ${m.region}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {raisedByType === "bride" && selectedLead && (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
            <p className="font-medium text-emerald-900">
              Linked: {selectedLead.brideName}{" "}
              <span className="font-normal text-emerald-800">({selectedLead.displayId})</span>
            </p>
            <p className="text-xs text-emerald-800 capitalize">{selectedLead.region ?? "—"}</p>
            <button
              type="button"
              className="mt-1 text-xs text-emerald-700 underline"
              onClick={() => {
                setSelectedLead(null);
                setLeadId("");
              }}
            >
              Clear link
            </button>
          </div>
        )}
      </div>

      {pendingTickets.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-950">
            {pendingTickets.length} open ticket{pendingTickets.length === 1 ? "" : "s"} for this{" "}
            {raisedByType === "bride" ? "bride" : "artist"}
          </p>
          <ul className="mt-2 space-y-1.5">
            {pendingTickets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Link
                  href={`/care/grievances/${t.id}`}
                  className="font-medium text-brand hover:underline"
                  target="_blank"
                >
                  {t.ticketNumber}
                </Link>
                <Link
                  href={`/care/grievances/${t.id}?addUpdate=1`}
                  className="text-xs text-accent hover:underline"
                >
                  Add update
                </Link>
                <Badge variant="muted">
                  {TICKET_CATEGORY_LABELS[t.category] ?? t.category.replace(/_/g, " ")}
                </Badge>
                <span className="text-xs text-amber-900">
                  {ticketStatusLabel(t.status)} · {formatDate(t.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium">Complaint / message</label>
        <textarea
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          rows={5}
          value={complaintText}
          onChange={(e) => setComplaintText(e.target.value)}
          placeholder={
            raisedByType === "bride"
              ? "What did the bride report?"
              : "What did the artist report?"
          }
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Attachments{" "}
          <span className="font-normal text-slate-muted">
            ({files.length}/{MAX_INTAKE_ATTACHMENTS} max, 10 MB each)
          </span>
        </label>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={TICKET_ATTACHMENT_ACCEPT}
          disabled={files.length >= MAX_INTAKE_ATTACHMENTS}
          className="block w-full text-sm text-slate-muted file:mr-3 file:rounded file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:text-white disabled:opacity-50"
          onChange={(e) => addFiles(e.target.files)}
        />
        <p className="mt-1 text-xs text-slate-muted">
          Hold Cmd (Mac) or Ctrl (Windows) to pick several at once, or use Add files again.
        </p>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {files.map((f, i) => (
              <li key={`${f.name}-${f.size}-${i}`} className="flex items-center justify-between gap-2">
                <span className="text-slate-muted">
                  {f.name} ({Math.round(f.size / 1024)} KB)
                </span>
                <button
                  type="button"
                  className="text-red-600 hover:underline"
                  onClick={() => removeFile(i)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button
          onClick={submit}
          disabled={loading || complaintText.trim().length < 10}
          className="flex-1"
        >
          {loading ? "Creating…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
