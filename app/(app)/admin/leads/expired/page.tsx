"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminExportCsvButton } from "@/components/admin/AdminExportCsvButton";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import {
  expiredLeadBudgetLabel,
  type AdminExpiredLeadRow,
} from "@/lib/admin-expired-leads-shared";
import { formatDate } from "@/lib/utils";

function lastContactLabel(row: AdminExpiredLeadRow): string {
  if (!row.lastContactAt) return "—";
  const when = formatDate(row.lastContactAt);
  if (row.lastContactChannel === "whatsapp") return `${when} · WhatsApp`;
  return `${when} · Call`;
}

export default function ExpiredLeadsPage() {
  const [leads, setLeads] = useState<AdminExpiredLeadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void fetch("/api/admin/leads?status=expired")
      .then((r) => r.json())
      .then((json: { data: AdminExpiredLeadRow[] }) => {
        setLeads(json.data ?? []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Expired Leads</h1>
          <p className="text-sm text-slate-muted">
            Leads past SLA with no booking — review or reactivate from profile
          </p>
        </div>
        <AdminExportCsvButton apiPath="/api/admin/leads" query="status=expired" />
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Lead</TH>
              <TH>Region</TH>
              <TH>Event</TH>
              <TH>Budget</TH>
              <TH>Last RM</TH>
              <TH>MUA pushes</TH>
              <TH>Last contact</TH>
              <TH>Expired</TH>
            </TR>
          </THead>
          <TBody>
            {leads.length === 0 ? (
              <TR>
                <TD colSpan={8} className="py-8 text-center text-slate-muted">
                  No expired leads
                </TD>
              </TR>
            ) : (
              leads.map((l) => (
                <TR key={l.id}>
                  <TD>
                    <Link
                      href={`/rm/leads/${l.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {l.brideName}
                    </Link>
                    <p className="font-mono text-xs text-slate-muted">{l.displayId}</p>
                  </TD>
                  <TD className="capitalize text-sm">{l.region}</TD>
                  <TD className="text-sm whitespace-nowrap">{formatDate(l.eventDate)}</TD>
                  <TD className="text-sm whitespace-nowrap">{expiredLeadBudgetLabel(l)}</TD>
                  <TD className="text-sm">
                    {l.lastRouting ? (
                      <>
                        <span className="font-medium">{l.lastRouting}</span>
                        {l.lastRouting === "RM pool" ? (
                          <span className="block text-xs text-slate-muted">Not assigned</span>
                        ) : l.lastRmName &&
                          (l.lastRouting === "RM" || l.lastRouting === "Commission") ? (
                          <span className="block text-xs text-slate-muted">{l.lastRmName}</span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-sm font-medium">{l.muaPushCount}</TD>
                  <TD className="text-sm text-slate-muted whitespace-nowrap">
                    {lastContactLabel(l)}
                  </TD>
                  <TD className="text-sm text-slate-muted whitespace-nowrap">
                    {l.expiredAt ? formatDate(l.expiredAt.slice(0, 10)) : "—"}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      )}
    </div>
  );
}
