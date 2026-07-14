"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";

export const DAY_END_SUBMITTED_EVENT = "olready:day-end-submitted";

type SearchLead = { id: string; brideName: string; displayId?: string };
type SearchMua = { id: string; name: string; displayId?: string };

type SearchTicket = { id: string; ticketNumber: string; muaName?: string | null; brideName?: string | null };

interface EntitySearchInputProps {
  mode: "lead" | "mua" | "ticket";
  placeholder?: string;
  /** When mode=lead, restrict to the logged-in RM / commission queue. */
  leadScope?: "queue" | "all";
  onSelect: (item: { id: string; label: string }) => void;
}

export function EntitySearchInput({
  mode,
  placeholder,
  leadScope = "all",
  onSelect,
}: EntitySearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; label: string }>>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }
      if (mode === "ticket") {
        const res = await fetch(`/api/crm/tickets?q=${encodeURIComponent(q)}&openOnly=true`);
        const json = (await res.json()) as { data?: SearchTicket[] };
        setResults(
          (json.data ?? []).map((t) => ({
            id: t.id,
            label: `${t.ticketNumber}${t.muaName ? ` — ${t.muaName}` : t.brideName ? ` — ${t.brideName}` : ""}`,
          })),
        );
        setOpen(true);
        return;
      }
      const scopeParam = mode === "lead" && leadScope === "queue" ? "&scope=queue" : "";
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}${scopeParam}`);
      const json = (await res.json()) as {
        data?: { leads?: SearchLead[]; muas?: SearchMua[] };
      };
      if (mode === "lead") {
        setResults(
          (json.data?.leads ?? []).map((l) => ({
            id: l.id,
            label: `${l.brideName}${l.displayId ? ` (${l.displayId})` : ""}`,
          })),
        );
      } else {
        setResults(
          (json.data?.muas ?? []).map((m) => ({
            id: m.id,
            label: `${m.name}${m.displayId ? ` (${m.displayId})` : ""}`,
          })),
        );
      }
      setOpen(true);
    },
    [mode, leadScope],
  );

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void search(query), 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, search]);

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          placeholder
          ?? (mode === "lead"
            ? "Search lead / bride…"
            : mode === "ticket"
              ? "Search ticket…"
              : "Search MUA…")
        }
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-light-bg"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(r);
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function useDayEndSubmit() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const submit = useCallback(
    async (body: {
      submissionType: "report" | "leave";
      payload?: Record<string, unknown>;
    }) => {
      setSaving(true);
      try {
        const res = await fetch("/api/me/day-end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { error?: string | null };
        if (!res.ok) throw new Error(json.error ?? "Save failed");
        toast("Day end saved", "success");
        return true;
      } catch (e) {
        toast(
          e instanceof Error ? `Could not save: ${e.message}` : "Could not save day end",
          "error",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [toast],
  );

  return { submit, saving };
}
