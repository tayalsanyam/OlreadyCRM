"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { formatDate, cn } from "@/lib/utils";

type Row = {
  id: string;
  displayId: string;
  name: string;
  phone: string;
  segmentLabel: string;
  status: string;
  dueAt: string | null;
  createdAt: string;
};

export function MySupportInquiriesList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void fetch("/api/my/support-inquiries")
      .then((r) => r.json())
      .then((j) => setRows(j.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isOverdue = (dueAt: string | null) =>
    dueAt ? new Date(dueAt).getTime() < Date.now() : false;

  if (loading) {
    return <p className="text-sm text-slate-muted">Loading support inquiries…</p>;
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-muted">No support inquiries assigned to you.</p>;
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Inquiry</TH>
          <TH>Contact</TH>
          <TH>Due</TH>
          <TH />
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.id} className={cn(isOverdue(r.dueAt) && "bg-red-50/40")}>
            <TD>
              <p className="font-mono text-sm font-medium">{r.displayId}</p>
              <p className="text-xs text-slate-muted">{r.segmentLabel}</p>
            </TD>
            <TD>
              <p className="text-sm">{r.name}</p>
              <p className="text-xs text-slate-muted">{r.phone}</p>
            </TD>
            <TD className={cn(isOverdue(r.dueAt) && "font-medium text-red-600")}>
              {r.dueAt ? formatDate(r.dueAt) : "—"}
            </TD>
            <TD>
              <Link href={`/tasks/support/${r.id}`} className="text-sm text-accent hover:underline">
                Open
              </Link>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
