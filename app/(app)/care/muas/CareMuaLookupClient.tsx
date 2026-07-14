"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";

type MuaRow = {
  id: string;
  displayId: string;
  name: string;
  phone: string | null;
  city: string | null;
  planTier: string | null;
  openTickets: number;
};

export function CareMuaLookupClient() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<MuaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((query: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    void fetch(`/api/crm/muas?${params}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) {
          setError(json.error ?? "Search failed");
          setRows([]);
          return;
        }
        setRows(json.data ?? []);
      })
      .catch(() => {
        setError("Could not reach MUA search");
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">MUA Lookup</h1>
        <p className="text-sm text-slate-muted">
          Search by name, city, display ID, or phone — view profile and care ticket history
        </p>
      </div>

      <Input
        placeholder="Search MUA name, phone, city…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
      />

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <Table>
        <THead>
          <TR>
            <TH>ID</TH>
            <TH>Name</TH>
            <TH>Phone</TH>
            <TH>City</TH>
            <TH>Plan</TH>
            <TH>Open tickets</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {loading ? (
            <TR>
              <TD colSpan={7} className="text-center text-slate-muted">
                Loading…
              </TD>
            </TR>
          ) : rows.length === 0 ? (
            <TR>
              <TD colSpan={7} className="text-center text-slate-muted">
                No MUAs found
              </TD>
            </TR>
          ) : (
            rows.map((m) => (
              <TR key={m.id}>
                <TD className="font-mono text-xs">{m.displayId}</TD>
                <TD className="font-medium">{m.name}</TD>
                <TD className="text-xs">{m.phone ?? "—"}</TD>
                <TD>{m.city ?? "—"}</TD>
                <TD className="capitalize text-xs">{m.planTier?.replace(/_/g, " ") ?? "—"}</TD>
                <TD>
                  {m.openTickets > 0 ? (
                    <Badge variant="hot">{m.openTickets}</Badge>
                  ) : (
                    <span className="text-slate-muted">0</span>
                  )}
                </TD>
                <TD>
                  <Link
                    href={`/care/muas/${m.id}`}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    View
                  </Link>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
