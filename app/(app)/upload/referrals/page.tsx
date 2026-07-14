"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { VerifyLeadSlideOver } from "@/components/upload/VerifyLeadSlideOver";
import { formatDate, cn } from "@/lib/utils";
import { uploadReferralCreateLeadHref } from "@/lib/upload-referral-lead-url";
import type { BrideLead, FeedbackReferralStatus } from "@/lib/types";

type ReferralRow = {
  id: string;
  referralName: string;
  referralPhone: string;
  status: FeedbackReferralStatus;
  sourceDisplayId: string;
  sourceBrideName: string;
  capturedByName: string;
  convertedLeadId: string | null;
  createdAt: string;
};

type ReferralFilter = "latest" | "all" | FeedbackReferralStatus;

const FILTER_TABS: { value: ReferralFilter; label: string }[] = [
  { value: "latest", label: "Latest" },
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "picked_up", label: "In progress" },
  { value: "converted", label: "Verified" },
  { value: "dismissed", label: "Rejected" },
];

function statusBadge(status: FeedbackReferralStatus) {
  switch (status) {
    case "pending":
      return <Badge variant="muted">Pending</Badge>;
    case "picked_up":
      return <Badge className="bg-amber-100 text-amber-900">In progress</Badge>;
    case "converted":
      return <Badge className="bg-emerald-100 text-emerald-900">Verified</Badge>;
    case "dismissed":
      return <Badge className="bg-rose-100 text-rose-900">Rejected</Badge>;
    default:
      return <Badge variant="muted">{status}</Badge>;
  }
}

export default function UploadReferralsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [filter, setFilter] = useState<ReferralFilter>("latest");
  const [loading, setLoading] = useState(true);
  const [verifyLead, setVerifyLead] = useState<BrideLead | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    void fetch(`/api/upload/feedback-referrals?status=${filter}`)
      .then((r) => r.json())
      .then((j: { data: ReferralRow[] }) => {
        setRows(j.data ?? []);
        setLoading(false);
      });
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function openVerify(row: ReferralRow) {
    if (!row.convertedLeadId) return;
    const res = await fetch(`/api/leads/${row.convertedLeadId}`);
    const json = (await res.json()) as { data?: { lead?: BrideLead }; error?: string };
    if (!res.ok || !json.data?.lead) {
      return;
    }
    setVerifyLead(json.data.lead);
    setVerifyOpen(true);
  }

  const emptyMessage =
    filter === "latest"
      ? "No pending referrals — you're caught up"
      : "No referrals in this view";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">Feedback referrals</h1>
          <p className="text-sm text-slate-muted">
            Create and verify leads from names and phones captured on feedback calls.
          </p>
        </div>
        <Link href="/upload/leads" className="text-sm text-accent hover:underline">
          ← Upload leads
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              filter === tab.value
                ? "bg-brand text-white"
                : "border border-slate-200 text-slate-700 hover:bg-slate-50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-muted">Loading…</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Phone</TH>
              <TH>Source lead</TH>
              <TH>Captured by</TH>
              <TH>Status</TH>
              <TH>Date</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TR>
                <TD colSpan={7} className="py-8 text-center text-slate-muted">
                  {emptyMessage}
                </TD>
              </TR>
            ) : (
              rows.map((r) => (
                <TR key={r.id}>
                  <TD>{r.referralName}</TD>
                  <TD>{r.referralPhone}</TD>
                  <TD>
                    {r.sourceDisplayId} — {r.sourceBrideName}
                  </TD>
                  <TD>{r.capturedByName}</TD>
                  <TD>{statusBadge(r.status)}</TD>
                  <TD className="text-xs">{formatDate(r.createdAt)}</TD>
                  <TD className="space-x-2 whitespace-nowrap">
                    {r.status === "pending" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          router.push(
                            uploadReferralCreateLeadHref({
                              name: r.referralName,
                              phone: r.referralPhone,
                              referralId: r.id,
                            })
                          );
                        }}
                      >
                        Create lead
                      </Button>
                    )}
                    {r.status === "picked_up" && r.convertedLeadId && (
                      <Button size="sm" onClick={() => void openVerify(r)}>
                        Verify
                      </Button>
                    )}
                    {r.status === "converted" && r.convertedLeadId && (
                      <Link
                        href={`/upload/leads`}
                        className="text-xs text-accent hover:underline"
                      >
                        View in leads
                      </Link>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      )}

      <VerifyLeadSlideOver
        open={verifyOpen}
        onClose={() => {
          setVerifyOpen(false);
          setVerifyLead(null);
        }}
        lead={verifyLead}
        onVerified={() => {
          setVerifyOpen(false);
          setVerifyLead(null);
          load();
        }}
      />
    </div>
  );
}
