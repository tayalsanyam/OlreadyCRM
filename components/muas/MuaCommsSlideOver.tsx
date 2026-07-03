"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  UserPlus,
  ArrowRight,
  Send,
  RefreshCw,
  CheckCircle,
  Zap,
  ArrowRightLeft,
  Phone,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { cn } from "@/lib/utils";
import type { CommEntryType } from "@/lib/types";
import type { MuaCommRow } from "@/app/api/muas/[id]/comms/route";

const ENTRY_ICON: Partial<Record<CommEntryType, LucideIcon>> = {
  leadCreated: UserPlus,
  assigned: ArrowRight,
  muaPushed: Send,
  stageUpdated: RefreshCw,
  bookingConfirmed: CheckCircle,
  capBypass: Zap,
  shiftedCommission: ArrowRightLeft,
  callLogged: Phone,
  whatsappLogged: MessageSquare,
  conversationClosed: CheckCircle,
  closeConfirmation: CheckCircle,
};

const ENTRY_BADGE: Partial<Record<CommEntryType, string>> = {
  leadCreated: "bg-slate-100 text-slate-700",
  assigned: "bg-slate-100 text-slate-700",
  muaPushed: "bg-brand/10 text-brand",
  stageUpdated: "bg-blue-100 text-blue-800",
  capBypass: "bg-amber-100 text-amber-900",
  bookingConfirmed: "bg-emerald-100 text-emerald-800",
  conversationClosed: "bg-slate-100 text-slate-600",
  closeConfirmation: "bg-amber-100 text-amber-900",
  callLogged: "bg-indigo-100 text-indigo-800",
  whatsappLogged: "bg-teal-100 text-teal-800",
  note: "bg-slate-100 text-slate-600",
};

type FilterTab = "all" | "calls" | "whatsapp" | "stages" | "bookings";

interface MuaCommsSlideOverProps {
  muaId: string;
  muaName: string;
  open: boolean;
  onClose: () => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function matchesTab(entryType: CommEntryType, tab: FilterTab): boolean {
  if (tab === "all") return true;
  if (tab === "calls") return entryType === "callLogged";
  if (tab === "whatsapp") return entryType === "whatsappLogged";
  if (tab === "stages")
    return ["stageUpdated", "muaPushed", "capBypass", "conversationClosed"].includes(
      entryType
    );
  if (tab === "bookings")
    return ["bookingConfirmed", "closeConfirmation"].includes(entryType);
  return true;
}

export function MuaCommsSlideOver({
  muaId,
  muaName,
  open,
  onClose,
}: MuaCommsSlideOverProps) {
  const [rows, setRows] = useState<MuaCommRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<FilterTab>("all");

  useEffect(() => {
    if (!open || !muaId) return;
    setLoading(true);
    void fetch(`/api/muas/${muaId}/comms`)
      .then((r) => r.json())
      .then((json: { data: MuaCommRow[] | null }) => {
        setRows(json.data ?? []);
        setLoading(false);
      });
  }, [open, muaId]);

  const filtered = useMemo(
    () => rows.filter((r) => matchesTab(r.entryType, tab)),
    [rows, tab]
  );

  const tabs: { id: FilterTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "calls", label: "Calls" },
    { id: "whatsapp", label: "WhatsApp" },
    { id: "stages", label: "Stage Changes" },
    { id: "bookings", label: "Bookings" },
  ];

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={`${muaName} — Communication History`}
      wide
    >
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-100 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-muted hover:bg-slate-200"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-muted">
          No communications logged for this MUA yet
        </p>
      ) : (
        <ul className="relative space-y-0 border-l-2 border-slate-200 pl-6">
          {filtered.map((entry) => {
            const Icon = ENTRY_ICON[entry.entryType] ?? MessageSquare;
            const badge = ENTRY_BADGE[entry.entryType] ?? "bg-slate-100 text-slate-600";
            return (
              <li key={entry.id} className="relative pb-6">
                <span
                  className={cn(
                    "absolute -left-[1.65rem] top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white",
                    badge
                  )}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <p className="text-[11px] text-slate-muted">
                  {formatTime(entry.createdAt)}
                </p>
                <span
                  className={cn(
                    "mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    badge
                  )}
                >
                  {entry.entryType.replace(/([A-Z])/g, " $1").trim()}
                </span>
                <p className="mt-1 text-sm text-text">{entry.description.replace(/^\[Sales\]\s*/, "")}</p>
                {entry.actorName && (
                  <p className="mt-0.5 text-xs text-slate-muted">By {entry.actorName}</p>
                )}
                {entry.leadId ? (
                  <p className="mt-1 text-xs">
                    On lead:{" "}
                    <Link
                      href={`/rm/leads/${entry.leadId}`}
                      className="font-medium text-brand hover:underline"
                      onClick={onClose}
                    >
                      {entry.leadName} ({entry.leadDisplayId})
                    </Link>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SlideOver>
  );
}
