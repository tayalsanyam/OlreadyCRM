"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import type { PhoneLeadHistoryRow } from "@/lib/lead-phone-history";
import { EXIT_KIND_LABELS, type ExitKind } from "@/lib/lead-exit";
import { LEAD_STATUS_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { isValidPhone10, normalizePhoneDigits } from "@/lib/validation";

function commLabel(entryType: string): string {
  return entryType.replace(/_/g, " ");
}

export function PreviousLeadsForPhonePanel({
  phone,
  excludeLeadId,
  title = "Previous leads for this phone",
  immediate = false,
  hideWhenEmpty = false,
  onUseProfile,
}: {
  phone: string;
  excludeLeadId?: string | null;
  title?: string;
  immediate?: boolean;
  hideWhenEmpty?: boolean;
  onUseProfile?: (lead: PhoneLeadHistoryRow) => void | Promise<void>;
}) {
  const [rows, setRows] = useState<PhoneLeadHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const digits = normalizePhoneDigits(phone);
  const canLookup = digits.length >= 10 && isValidPhone10(phone);

  useEffect(() => {
    if (!canLookup) {
      setRows([]);
      setLoadedFor(null);
      return;
    }

    const key = `${digits}:${excludeLeadId ?? ""}`;
    const delay = immediate ? 0 : 400;
    const timer = window.setTimeout(() => {
      setLoading(true);
      const qs = new URLSearchParams({ phone });
      if (excludeLeadId) qs.set("excludeId", excludeLeadId);
      void fetch(`/api/upload/leads/by-phone?${qs}`)
        .then((r) => r.json())
        .then((json: { data: PhoneLeadHistoryRow[] | null }) => {
          setRows(json.data ?? []);
          setLoadedFor(key);
        })
        .catch(() => {
          setRows([]);
          setLoadedFor(key);
        })
        .finally(() => setLoading(false));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [canLookup, digits, phone, excludeLeadId, immediate]);

  if (!canLookup) return null;
  if (loading && loadedFor !== `${digits}:${excludeLeadId ?? ""}`) {
    return (
      <p className="text-sm text-slate-muted">Checking prior leads for this phone…</p>
    );
  }
  if (!rows.length) {
    if (hideWhenEmpty) {
      return (
        <p className="text-sm text-slate-muted">No other lead records on this phone number.</p>
      );
    }
    return (
      <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-muted">
        No prior leads on this phone.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4">
      <p className="text-sm font-medium text-amber-950">{title}</p>
      <p className="mt-1 text-xs text-amber-900">
        {rows.length} earlier record{rows.length === 1 ? "" : "s"}
        {onUseProfile
          ? " — attach a verified profile below when this is the same bride"
          : " — review history before adding or re-verifying"}
        .
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => {
          const expanded = expandedId === row.id;
          const exitLabel =
            row.exitKind && row.exitKind in EXIT_KIND_LABELS
              ? EXIT_KIND_LABELS[row.exitKind as ExitKind]
              : null;
          return (
            <li
              key={row.id}
              className="rounded-md border border-amber-100 bg-white p-3 text-sm shadow-sm"
            >
              <button
                type="button"
                className="flex w-full items-start justify-between gap-2 text-left"
                onClick={() => setExpandedId(expanded ? null : row.id)}
              >
                <div>
                  <span className="font-mono text-xs text-slate-muted">{row.displayId}</span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="font-medium text-brand">{row.brideName}</span>
                  <span className="mt-1 block text-xs text-slate-muted">
                    {row.city}, {row.region}
                    {row.eventDate ? ` · event ${formatDate(row.eventDate)}` : ""}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <Badge variant="muted">
                    {exitLabel ?? LEAD_STATUS_LABELS[row.status] ?? row.status}
                  </Badge>
                  <span className="mt-1 block text-xs text-slate-muted">
                    {expanded ? "Hide" : "History"}
                  </span>
                </div>
              </button>

              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-muted">
                <span>{row.commCount} log entries</span>
                {row.bookingCount > 0 ? <span>{row.bookingCount} booking(s)</span> : null}
                {row.pushCount > 0 ? <span>{row.pushCount} MUA push(es)</span> : null}
                {row.assignedRmName ? <span>RM: {row.assignedRmName}</span> : null}
                {row.lastActivityAt ? (
                  <span>Last activity {formatDate(row.lastActivityAt)}</span>
                ) : null}
              </div>

              {row.hostileNote ? (
                <p className="mt-2 text-xs text-red-800">
                  <span className="font-medium">Not answering:</span> {row.hostileNote}
                </p>
              ) : null}
              {row.handoverReason ? (
                <p className="mt-1 text-xs text-amber-900">
                  <span className="font-medium">Handover:</span> {row.handoverReason}
                </p>
              ) : null}

              {onUseProfile ? (
                <button
                  type="button"
                  className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-50"
                  onClick={() => void onUseProfile(row)}
                >
                  Use profile from {row.displayId}
                </button>
              ) : null}

              {expanded ? (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-muted">
                    Recent interactions
                  </p>
                  {row.recentComms.length ? (
                    <ul className="max-h-48 space-y-2 overflow-y-auto">
                      {row.recentComms.map((c, i) => (
                        <li key={`${c.createdAt}-${i}`} className="text-xs">
                          <span className="text-slate-muted">
                            {formatDate(c.createdAt)}
                            {c.actorName ? ` · ${c.actorName}` : ""}
                            {" · "}
                            <span className="capitalize">{commLabel(c.entryType)}</span>
                          </span>
                          <p className="text-slate-800">{c.description}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-muted">No activity logged.</p>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
