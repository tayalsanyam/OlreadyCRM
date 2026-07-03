"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AdminExportCsvButton } from "@/components/admin/AdminExportCsvButton";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { AdminFeedbackNav } from "@/components/admin/AdminFeedbackNav";
import { cn, formatDate } from "@/lib/utils";

type ReferralKind = "bride" | "mua";

type ReferralRow = {
  id: string;
  kind: ReferralKind;
  referralName: string;
  referralPhone: string | null;
  instaId?: string | null;
  city?: string | null;
  status: string;
  sourceDisplayId: string;
  sourceBrideName: string;
  capturedByName: string | null;
  createdAt: string;
};

type KindTab = "all" | ReferralKind;

function KindBadge({ kind }: { kind: ReferralKind }) {
  return (
    <Badge className={kind === "bride" ? "bg-sky-100 text-sky-900" : "bg-violet-100 text-violet-900"}>
      {kind === "bride" ? "Bride" : "MUA"}
    </Badge>
  );
}

export default function AdminFeedbackReferralsPage() {
  const [brideRows, setBrideRows] = useState<ReferralRow[]>([]);
  const [muaRows, setMuaRows] = useState<ReferralRow[]>([]);
  const [status, setStatus] = useState("pending");
  const [kindTab, setKindTab] = useState<KindTab>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void fetch(`/api/admin/feedback-referrals?status=${status}`)
      .then((r) => r.json())
      .then(
        (j: {
          data?: { brideReferrals?: ReferralRow[]; muaProspects?: ReferralRow[] };
        }) => {
          setBrideRows(j.data?.brideReferrals ?? []);
          setMuaRows(j.data?.muaProspects ?? []);
          setLoading(false);
        },
      );
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (status !== "pending" && kindTab === "mua") {
      setKindTab("bride");
    }
  }, [status, kindTab]);

  const visibleRows = useMemo(() => {
    if (kindTab === "bride") return brideRows;
    if (kindTab === "mua") return muaRows;
    return [...brideRows, ...muaRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [brideRows, muaRows, kindTab]);

  async function markPickedUp(id: string) {
    await fetch("/api/admin/feedback-referrals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "picked_up" }),
    });
    load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AdminFeedbackNav />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Feedback referrals</h1>
          <p className="text-sm text-slate-muted">
            Bride leads (friends/family) and outside MUAs captured on feedback calls.
          </p>
        </div>
        <AdminExportCsvButton apiPath="/api/admin/feedback-referrals" query={`status=${status}`} />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {(
          [
            ["all", `All (${brideRows.length + muaRows.length})`],
            ["bride", `Bride leads (${brideRows.length})`],
            ["mua", `Outside MUAs (${muaRows.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            disabled={id === "mua" && status !== "pending" && muaRows.length === 0}
            onClick={() => setKindTab(id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              kindTab === id ? "bg-brand text-white" : "text-slate-muted hover:bg-slate-100",
              id === "mua" && status !== "pending" && muaRows.length === 0 && "opacity-50",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["pending", "picked_up", "converted", "dismissed"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={
              status === s
                ? "rounded-lg bg-brand px-3 py-1.5 text-sm text-white"
                : "rounded-lg border px-3 py-1.5 text-sm"
            }
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {status !== "pending" ? (
        <p className="text-xs text-slate-muted">
          Outside MUAs appear under <strong>Pending</strong> only — use the MUA Prospects page for
          full recruitment tracking.
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-muted">Loading…</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Type</TH>
              <TH>Name</TH>
              <TH>Phone</TH>
              <TH>City / Insta</TH>
              <TH>From lead</TH>
              <TH>Captured by</TH>
              <TH>Status</TH>
              <TH>Date</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {visibleRows.length === 0 ? (
              <TR>
                <TD colSpan={9} className="py-8 text-center text-slate-muted">
                  No referrals in this view
                </TD>
              </TR>
            ) : (
              visibleRows.map((r) => (
                <TR key={`${r.kind}-${r.id}`}>
                  <TD>
                    <KindBadge kind={r.kind} />
                  </TD>
                  <TD className="font-medium">{r.referralName}</TD>
                  <TD>{r.referralPhone ?? "—"}</TD>
                  <TD className="text-xs text-slate-muted">
                    {r.kind === "mua"
                      ? [r.city, r.instaId].filter(Boolean).join(" · ") || "—"
                      : "—"}
                  </TD>
                  <TD>
                    {r.sourceDisplayId} — {r.sourceBrideName}
                  </TD>
                  <TD>{r.capturedByName ?? "—"}</TD>
                  <TD>
                    <Badge variant="muted">{r.status.replace("_", " ")}</Badge>
                  </TD>
                  <TD className="text-xs">{formatDate(r.createdAt)}</TD>
                  <TD>
                    {r.kind === "bride" && r.status === "pending" ? (
                      <Button size="sm" variant="secondary" onClick={() => void markPickedUp(r.id)}>
                        Mark picked up
                      </Button>
                    ) : null}
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
