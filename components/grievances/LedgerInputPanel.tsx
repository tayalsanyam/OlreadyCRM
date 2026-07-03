"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

type MatchRow = {
  id?: string;
  leadName: string;
  leadPhone: string;
  matchedLeadId: string | null;
  matchConfidence: number | null;
  matchFlags: string[];
  leadDisplayId?: string | null;
};

function flagLabel(flags: string[]): string | null {
  if (flags.includes("not_in_crm")) return "Not in CRM";
  if (flags.includes("multiple_match")) return "Multiple matches";
  return null;
}

export function LedgerInputPanel({ ticketId }: { ticketId: string }) {
  const { toast } = useToast();
  const [paste, setPaste] = useState("");
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadExisting = useCallback(async () => {
    try {
      const res = await fetch(`/api/crm/tickets/${ticketId}/ledger-upload`);
      const json = await res.json();
      if (res.ok) setRows(json.data ?? []);
    } catch {
      toast("Could not load ledger data. Restart dev server if this persists.", "error");
    }
  }, [ticketId, toast]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  const submitPaste = async () => {
    setLoading(true);
    const res = await fetch(`/api/crm/tickets/${ticketId}/ledger-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paste }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast(json.error ?? "Upload failed", "error");
      return;
    }
    toast(`Ledger attached — ${json.data.rows.length} rows`);
    setRows(json.data.rows);
    setPaste("");
  };

  const submitFile = async (file: File) => {
    setLoading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/crm/tickets/${ticketId}/ledger-upload`, {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast(json.error ?? "Upload failed", "error");
      return;
    }
    toast(`File attached — ${json.data.rows.length} rows`);
    setRows(json.data.rows);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-brand">Lead usage ledger</h2>
        <Button size="sm" variant="secondary" onClick={loadExisting}>
          Refresh
        </Button>
      </div>

      <div className="mb-4 space-y-2">
        <p className="text-xs text-slate-muted">
          Upload CSV/TSV export or paste tab-separated rows: Lead Name + Phone (header row optional)
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
          className="block w-full text-xs text-slate-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void submitFile(file);
          }}
          disabled={loading}
        />
      </div>

      <textarea
        className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono"
        rows={4}
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        placeholder={"Lead Name\tPhone\nPriya Sharma\t9876543210"}
      />
      <Button size="sm" onClick={submitPaste} disabled={loading || !paste.trim()}>
        {loading ? "Matching…" : "Attach pasted ledger"}
      </Button>

      {rows.length > 0 && (
        <div className="mt-3 max-h-48 overflow-y-auto text-xs">
          <table className="w-full">
            <thead>
              <tr className="text-left text-slate-muted">
                <th className="pb-1">Lead</th>
                <th className="pb-1">Phone</th>
                <th className="pb-1">CRM match</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const flag = flagLabel(r.matchFlags ?? []);
                return (
                  <tr key={r.id ?? i} className="border-t border-slate-100">
                    <td className="py-1">{r.leadName}</td>
                    <td className="py-1">{r.leadPhone}</td>
                    <td className="py-1">
                      {r.matchedLeadId ? (
                        <span className={flag ? "text-amber-700" : "text-emerald-700"}>
                          {r.leadDisplayId ?? r.matchedLeadId.slice(0, 8)}
                          {flag ? ` (${flag})` : ""}
                        </span>
                      ) : (
                        <span className="text-red-600">not in CRM</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
