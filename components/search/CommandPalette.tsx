"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BUDGET_TIER_LABELS,
  PLAN_TIER_LABELS,
  URGENCY_LABELS,
  type BudgetTier,
  type PlanTier,
  type SessionUser,
  type UrgencyBand,
} from "@/lib/types";

const URGENCY_DOT: Record<UrgencyBand, string> = {
  critical: "bg-red-500",
  hot: "bg-orange-500",
  active: "bg-blue-500",
  longShelf: "bg-slate-400",
};

const PLAN_BADGE: Record<PlanTier, string> = {
  highestPrivy: "bg-amber-100 text-amber-900",
  phoenix2: "bg-indigo-100 text-indigo-900",
  phoenix: "bg-blue-100 text-blue-800",
  pro: "bg-slate-200 text-slate-800",
  prime: "bg-gray-100 text-gray-600",
};

interface SearchLead {
  id: string;
  displayId: string;
  brideName: string;
  phone: string;
  city: string;
  budgetTier: BudgetTier;
  urgencyBand: UrgencyBand;
  status: string;
}

interface SearchMua {
  id: string;
  displayId: string;
  name: string;
  city: string;
  planTier: PlanTier | null;
}

type FlatItem =
  | { kind: "lead"; item: SearchLead }
  | { kind: "mua"; item: SearchMua };

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  user: SessionUser;
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function CommandPalette({ open, onClose, user }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [leads, setLeads] = useState<SearchLead[]>([]);
  const [muas, setMuas] = useState<SearchMua[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const debounced = useDebouncedValue(query, 200);

  const flatItems: FlatItem[] = useMemo(
    () => [
      ...leads.map((item) => ({ kind: "lead" as const, item })),
      ...muas.map((item) => ({ kind: "mua" as const, item })),
    ],
    [leads, muas]
  );

  const reset = useCallback(() => {
    setQuery("");
    setLeads([]);
    setMuas([]);
    setActiveIndex(0);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    inputRef.current?.focus();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    if (debounced.trim().length < 2) {
      setLeads([]);
      setMuas([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetch(
      `/api/search?q=${encodeURIComponent(debounced.trim())}&limit=5`
    )
      .then((r) => r.json())
      .then(
        (json: {
          data: { leads: SearchLead[]; muas: SearchMua[] } | null;
        }) => {
          if (cancelled) return;
          setLeads(json.data?.leads ?? []);
          setMuas(json.data?.muas ?? []);
          setActiveIndex(0);
        }
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  const navigate = useCallback(
    (item: FlatItem) => {
      if (item.kind === "lead") {
        router.push(`/rm/leads/${item.item.id}`);
      } else if (user.role === "admin" || user.role === "owner") {
        router.push(`/admin/muas/${item.item.id}`);
      } else if (user.role === "feedbackRm") {
        router.push(`/feedback/muas/${item.item.id}`);
      } else if (user.role === "careAgent") {
        router.push(`/care/muas/${item.item.id}`);
      } else if (user.role === "commissionRm") {
        router.push(`/commission/muas/${item.item.id}`);
      } else {
        router.push(`/rm/muas/${item.item.id}`);
      }
      onClose();
    },
    [router, user.role, onClose]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (flatItems.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % flatItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + flatItems.length) % flatItems.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatItems[activeIndex];
        if (item) navigate(item);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flatItems, activeIndex, onClose, navigate]);

  if (!open) return null;

  let rowOffset = 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal
        aria-label="Search"
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-slate-muted" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search leads, MUAs…"
            className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-slate-muted"
            autoComplete="off"
          />
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto">
          {loading && (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-lg bg-slate-100"
                />
              ))}
            </div>
          )}

          {!loading && query.trim().length >= 2 && flatItems.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-muted">
              No results for &apos;{query.trim()}&apos;
            </p>
          )}

          {!loading && leads.length > 0 && (
            <section>
              <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-muted">
                Leads
              </p>
              <ul>
                {leads.map((lead) => {
                  const idx = rowOffset++;
                  const active = idx === activeIndex;
                  return (
                    <li key={lead.id}>
                      <button
                        type="button"
                        onClick={() => navigate({ kind: "lead", item: lead })}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                          active ? "bg-brand/5" : "hover:bg-light-bg"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                            URGENCY_DOT[lead.urgencyBand]
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-brand">
                            {lead.brideName}{" "}
                            <span className="font-mono text-xs text-slate-muted">
                              · {lead.displayId}
                            </span>
                          </p>
                          <p className="text-xs text-slate-muted">
                            {URGENCY_LABELS[lead.urgencyBand]} ·{" "}
                            {BUDGET_TIER_LABELS[lead.budgetTier]} · {lead.city}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {!loading && muas.length > 0 && (
            <section className="border-t border-slate-100">
              <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-muted">
                MUAs
              </p>
              <ul>
                {muas.map((mua) => {
                  const idx = rowOffset++;
                  const active = idx === activeIndex;
                  return (
                    <li key={mua.id}>
                      <button
                        type="button"
                        onClick={() => navigate({ kind: "mua", item: mua })}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                          active ? "bg-brand/5" : "hover:bg-light-bg"
                        )}
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                          {mua.name.charAt(0)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-brand">
                            {mua.name} · {mua.city}
                          </p>
                          {mua.planTier && (
                            <span
                              className={cn(
                                "mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                                PLAN_BADGE[mua.planTier]
                              )}
                            >
                              {PLAN_TIER_LABELS[mua.planTier]}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
