"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { formatDate, cn } from "@/lib/utils";

type BrideReferralRow = {
  id: string;
  referralName: string;
  referralPhone: string | null;
  captureType?: string;
  notes?: string | null;
  status: string;
  sourceDisplayId: string;
  sourceBrideName: string;
  createdAt: string;
};

type MuaProspectRow = {
  id: string;
  muaName: string;
  phone: string | null;
  instaId: string | null;
  city: string | null;
  status: string;
  sourceDisplayId: string;
  sourceBrideName: string;
  createdAt: string;
};

type Tab = "brides" | "muas";

export default function FeedbackReferralsPage() {
  const [tab, setTab] = useState<Tab>("brides");
  const [brideRows, setBrideRows] = useState<BrideReferralRow[]>([]);
  const [muaRows, setMuaRows] = useState<MuaProspectRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void fetch("/api/feedback/referrals?status=pending")
      .then((r) => r.json())
      .then(
        (j: {
          data?: {
            brideReferrals: BrideReferralRow[];
            muaProspects: MuaProspectRow[];
          };
        }) => {
          setBrideRows(j.data?.brideReferrals ?? []);
          setMuaRows(j.data?.muaProspects ?? []);
          setLoading(false);
        }
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">Captured referrals</h1>
        <p className="text-sm text-slate-muted">
          From feedback calls — new bride leads (friends/family) and outside MUAs for recruitment.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {(
          [
            ["brides", `Bride leads (${brideRows.length})`],
            ["muas", `Outside MUAs (${muaRows.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              tab === id ? "bg-brand text-white" : "text-slate-muted hover:bg-slate-100"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-muted">Loading…</p>
      ) : tab === "brides" ? (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Phone</TH>
              <TH>Note</TH>
              <TH>Source call (bride)</TH>
              <TH>Status</TH>
              <TH>Captured</TH>
            </TR>
          </THead>
          <TBody>
            {brideRows.length === 0 ? (
              <TR>
                <TD colSpan={6} className="py-8 text-center text-slate-muted">
                  No pending bride referrals — structured name + phone rows go to upload.
                  Notes without a phone create a task on your Tasks tab.
                </TD>
              </TR>
            ) : (
              brideRows.map((r) => (
                <TR key={r.id}>
                  <TD>{r.referralName}</TD>
                  <TD>{r.referralPhone ?? "—"}</TD>
                  <TD className="max-w-xs text-xs text-slate-muted">
                    {r.captureType === "note" ? r.notes ?? "—" : "—"}
                  </TD>
                  <TD>
                    {r.sourceDisplayId} — {r.sourceBrideName}
                  </TD>
                  <TD>
                    <Badge variant="muted">{r.status}</Badge>
                  </TD>
                  <TD className="text-xs">{formatDate(r.createdAt)}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>MUA name</TH>
              <TH>Phone</TH>
              <TH>City / Insta</TH>
              <TH>Source call (bride)</TH>
              <TH>Status</TH>
              <TH>Captured</TH>
            </TR>
          </THead>
          <TBody>
            {muaRows.length === 0 ? (
              <TR>
                <TD colSpan={6} className="py-8 text-center text-slate-muted">
                  No outside MUAs yet — choose &quot;Someone else&quot; in feedback when the bride
                  booked outside Olready.
                </TD>
              </TR>
            ) : (
              muaRows.map((r) => (
                <TR key={r.id}>
                  <TD>{r.muaName}</TD>
                  <TD>{r.phone ?? "—"}</TD>
                  <TD className="text-xs">
                    {[r.city, r.instaId].filter(Boolean).join(" · ") || "—"}
                  </TD>
                  <TD>
                    {r.sourceDisplayId} — {r.sourceBrideName}
                  </TD>
                  <TD>
                    <Badge variant="muted">{r.status}</Badge>
                  </TD>
                  <TD className="text-xs">{formatDate(r.createdAt)}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-muted">
        <p className="font-medium text-brand">Who works these?</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <strong>Bride leads</strong> — upload team picks up from their Feedback Referrals queue
            and creates verified leads.
          </li>
          <li>
            <strong>Outside MUAs</strong> — admin MUA Prospects list; recruitment follows from
            there.
          </li>
        </ul>
      </div>
    </div>
  );
}
