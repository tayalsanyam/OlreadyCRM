"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type MuaSearchOption = {
  id: string;
  label: string;
  city?: string | null;
  displayId?: string | null;
};

type MuaHit = {
  id: string;
  name: string;
  city?: string | null;
  displayId?: string | null;
};

type Props = {
  label?: string;
  value: string;
  selectedLabel?: string;
  onChange: (id: string, label: string) => void;
  suggestedOptions?: MuaSearchOption[];
  placeholder?: string;
  minSearchLength?: number;
};

export function MuaSearchPicker({
  label = "Olready MUA",
  value,
  selectedLabel,
  onChange,
  suggestedOptions = [],
  placeholder = "Search MUA name…",
  minSearchLength = 2,
}: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MuaHit[]>([]);
  const [searching, setSearching] = useState(false);

  const filteredSuggested = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suggestedOptions;
    return suggestedOptions.filter((m) => m.label.toLowerCase().includes(q));
  }, [query, suggestedOptions]);

  const searchRemote = useCallback(async () => {
    const q = query.trim();
    if (q.length < minSearchLength) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/commission/muas?q=${encodeURIComponent(q)}&pageSize=25`
      );
      const json = (await res.json()) as {
        data?: { data?: MuaHit[] } | null;
      };
      const rows = json.data?.data ?? [];
      const suggestedIds = new Set(suggestedOptions.map((m) => m.id));
      setHits(rows.filter((m) => !suggestedIds.has(m.id)));
    } finally {
      setSearching(false);
    }
  }, [query, minSearchLength, suggestedOptions]);

  useEffect(() => {
    const t = setTimeout(() => void searchRemote(), 300);
    return () => clearTimeout(t);
  }, [searchRemote]);

  function pick(id: string, name: string) {
    onChange(id, name);
    setQuery("");
    setHits([]);
  }

  function clear() {
    onChange("", "");
    setQuery("");
    setHits([]);
  }

  const showSuggested = filteredSuggested.length > 0;
  const showHits = query.trim().length >= minSearchLength && hits.length > 0;
  const showEmpty =
    query.trim().length >= minSearchLength &&
    !searching &&
    !showHits &&
    !showSuggested;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-text">{label}</label>
      {value ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span>{selectedLabel || value}</span>
          <button
            type="button"
            className="text-xs font-medium text-red-600 hover:underline"
            onClick={clear}
          >
            Clear
          </button>
        </div>
      ) : (
        <>
          <input
            type="search"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {showSuggested ? (
            <div className="mt-2">
              <p className="mb-1 px-1 text-xs font-medium text-slate-muted">
                {query.trim() ? "From this lead" : "Suggested from this lead"}
              </p>
              <ul className="max-h-36 overflow-y-auto rounded-lg border border-slate-200">
                {filteredSuggested.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => pick(m.id, m.label)}
                    >
                      {m.displayId ? `${m.displayId} · ` : ""}
                      {m.label}
                      {m.city ? ` · ${m.city}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {showHits ? (
            <div className="mt-2">
              <p className="mb-1 px-1 text-xs font-medium text-slate-muted">
                Search results
              </p>
              <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200">
                {hits.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => pick(m.id, m.name)}
                    >
                      {m.displayId ? `${m.displayId} · ` : ""}
                      {m.name}
                      {m.city ? ` · ${m.city}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {searching ? (
            <p className="mt-2 px-1 text-xs text-slate-muted">Searching…</p>
          ) : null}
          {showEmpty ? (
            <p className="mt-2 px-1 text-xs text-slate-muted">No MUAs match that name.</p>
          ) : null}
          {query.trim().length > 0 && query.trim().length < minSearchLength ? (
            <p className="mt-2 px-1 text-xs text-slate-muted">
              Type at least {minSearchLength} characters to search all MUAs.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
