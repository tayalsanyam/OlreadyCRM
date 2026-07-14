"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PipelineQuickContact } from "@/components/sales/PipelineQuickContact";
import {
  focusDueLabel,
  focusKindLabel,
  muaInitials,
  type TodaysFocusItem,
  type TodaysFocusKind,
} from "@/lib/sales-todays-focus";

const KIND_STYLES: Record<
  TodaysFocusKind,
  { card: string; badge: string; avatar: string; label: string }
> = {
  demo: {
    card: "border-indigo-200 hover:border-indigo-400",
    badge: "text-indigo-700",
    avatar: "bg-indigo-100 text-indigo-900",
    label: "bg-indigo-100 text-indigo-800",
  },
  confirmed: {
    card: "border-cyan-200 hover:border-cyan-400",
    badge: "text-cyan-800",
    avatar: "bg-cyan-100 text-cyan-900",
    label: "bg-cyan-100 text-cyan-900",
  },
  dealClose: {
    card: "border-emerald-200 hover:border-emerald-400",
    badge: "text-emerald-800",
    avatar: "bg-emerald-100 text-emerald-900",
    label: "bg-emerald-100 text-emerald-900",
  },
  onboarding: {
    card: "border-violet-200 hover:border-violet-400",
    badge: "text-violet-800",
    avatar: "bg-violet-100 text-violet-900",
    label: "bg-violet-100 text-violet-900",
  },
  activationSendBack: {
    card: "border-amber-200 hover:border-amber-400",
    badge: "text-amber-900",
    avatar: "bg-amber-100 text-amber-900",
    label: "bg-amber-100 text-amber-900",
  },
};

export function TodaysFocusTray({
  items,
  onOpenFocusItem,
  onFilterFocus,
  focusActive,
  onContactLogged,
}: {
  items: TodaysFocusItem[];
  onOpenFocusItem: (item: TodaysFocusItem) => void;
  onFilterFocus: () => void;
  focusActive: boolean;
  onContactLogged?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const grouped: Record<TodaysFocusKind, TodaysFocusItem[]> = {
    demo: items.filter((i) => i.kind === "demo"),
    confirmed: items.filter((i) => i.kind === "confirmed"),
    dealClose: items.filter((i) => i.kind === "dealClose"),
    onboarding: items.filter((i) => i.kind === "onboarding"),
    activationSendBack: items.filter((i) => i.kind === "activationSendBack"),
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="text-xs font-semibold uppercase tracking-wide text-amber-900"
          onClick={() => setExpanded((v) => !v)}
        >
          Today&apos;s Focus ({items.length}) {expanded ? "▾" : "▸"}
        </button>
        {items.length > 0 ? (
          <Button size="sm" variant={focusActive ? "primary" : "secondary"} onClick={onFilterFocus}>
            {focusActive ? "Focus filter on" : "Filter list"}
          </Button>
        ) : null}
      </div>
      {expanded ? (
        items.length === 0 ? (
          <p className="text-sm text-amber-900/80">
            No demos, confirmations, deal closes, onboarding checklists, or activation send-backs due today. Scheduled items and open action tasks appear here.
          </p>
        ) : (
          <div className="space-y-4">
            {(["demo", "confirmed", "dealClose", "onboarding", "activationSendBack"] as const).map((kind) => {
              const list = grouped[kind];
              if (!list.length) return null;
              const styles = KIND_STYLES[kind];
              return (
                <div key={kind}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-900/80">
                    {focusKindLabel(kind)} ({list.length})
                  </p>
                  <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(15.5rem,17.5rem))]">
                    {list.map((item) => (
                      <div
                        key={`${item.kind}-${item.pipelineId}`}
                        className={`flex items-center gap-1.5 rounded-xl border bg-white p-2.5 shadow-sm transition hover:shadow-md ${
                          item.overdue ? "border-red-300 bg-red-50/60" : styles.card
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenFocusItem(item)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              item.overdue ? "bg-red-100 text-red-800" : styles.avatar
                            }`}
                          >
                            {muaInitials(item.muaName)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1">
                              <span className="truncate text-sm font-semibold text-brand">{item.muaName}</span>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                  item.overdue ? "bg-red-100 text-red-800" : styles.label
                                }`}
                              >
                                {focusKindLabel(kind)}
                              </span>
                            </span>
                            <span className="block truncate text-xs text-slate-600">{item.muaCity || "—"}</span>
                            {item.note ? (
                              <span className="mt-0.5 block line-clamp-2 text-xs text-amber-950/90">
                                {item.note}
                              </span>
                            ) : null}
                            <span
                              className={`mt-0.5 block text-xs font-semibold ${
                                item.overdue ? "text-red-700" : styles.badge
                              }`}
                            >
                              {focusDueLabel(kind, item.scheduledAt)}
                            </span>
                          </span>
                        </button>
                        <div className="shrink-0 border-l border-slate-100 pl-1.5">
                          <PipelineQuickContact
                            pipelineId={item.pipelineId}
                            muaName={item.muaName}
                            muaPhone={item.muaPhone}
                            muaWhatsapp={item.muaWhatsapp}
                            muaCity={item.muaCity}
                            stage={item.stage}
                            layout="stacked"
                            variant="compact"
                            onLogged={onContactLogged}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : null}
    </div>
  );
}
