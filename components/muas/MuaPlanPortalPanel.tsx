"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import type { MuaPlanPortalPayload } from "@/lib/mua-plan-portal";
import type { MuaPlanHistoryRow } from "@/lib/types";
import { MuaPlanHistoryPanel } from "@/components/muas/MuaPlanHistoryPanel";
import { MuaPlanPeriodDetailView } from "@/components/muas/MuaPlanPeriodDetailView";
import { portalPayloadToPeriodDetail } from "@/lib/mua-plan-period-detail-shared";
import { isPortfolioImageUrl } from "@/lib/mua-portfolio-shared";

const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function MuaPlanPortalPanel({
  muaId,
  canEdit = false,
  planHistory = [],
}: {
  muaId: string;
  canEdit?: boolean;
  planHistory?: MuaPlanHistoryRow[];
}) {
  const [data, setData] = useState<MuaPlanPortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/muas/${muaId}/plan-portal`);
    const json = (await res.json()) as { data: MuaPlanPortalPayload | null };
    setData(json.data);
    setLoading(false);
  }, [muaId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addPortfolioItem() {
    if (!newTitle.trim() || !newFile) return;
    setBusy(true);
    setUploadError(null);
    const form = new FormData();
    form.append("title", newTitle.trim());
    form.append("file", newFile);
    if (newDesc.trim()) form.append("description", newDesc.trim());
    const res = await fetch(`/api/muas/${muaId}/portfolio`, {
      method: "POST",
      body: form,
    });
    const json = (await res.json()) as { error?: string | null };
    if (!res.ok) {
      setUploadError(json.error ?? "Upload failed");
      setBusy(false);
      return;
    }
    setNewTitle("");
    setNewDesc("");
    setNewFile(null);
    setBusy(false);
    void load();
  }

  async function removePortfolioItem(itemId: string) {
    setBusy(true);
    await fetch(`/api/muas/${muaId}/portfolio?itemId=${itemId}`, { method: "DELETE" });
    setBusy(false);
    void load();
  }

  if (loading || !data) {
    return (
      <Card className="p-4">
        <p className="text-sm text-slate-muted">Loading plan & portal…</p>
      </Card>
    );
  }

  const { servicePricing, portalProfileUrl, portfolioItems } = data;
  const currentPlanDetail = portalPayloadToPeriodDetail(data);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <MuaPlanPeriodDetailView detail={currentPlanDetail} heading="Current plan" />
      </Card>

      <MuaPlanHistoryPanel
        muaId={muaId}
        history={planHistory}
        currentPlanDetail={currentPlanDetail}
        title="All plans to date"
      />

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold text-brand">Service pricing (portal)</h2>
        {servicePricing.length === 0 ? (
          <p className="text-sm text-slate-muted">No service prices listed on profile.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Service</TH>
                <TH>From (₹)</TH>
              </TR>
            </THead>
            <TBody>
              {servicePricing.map((s) => (
                <TR key={s.name}>
                  <TD>{s.name}</TD>
                  <TD>{s.baseAmount != null ? fmt.format(s.baseAmount) : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold text-brand">Portal profile & work</h2>
        {portalProfileUrl ? (
          <p className="text-sm">
            Olready portal profile:{" "}
            <Link
              href={portalProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent hover:underline"
            >
              {portalProfileUrl} ↗
            </Link>
          </p>
        ) : (
          <p className="text-sm text-slate-muted">No olready.in portal profile link on file.</p>
        )}

        {portfolioItems.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {portfolioItems.map((item) => (
              <div
                key={item.id}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <a href={item.mediaUrl} target="_blank" rel="noopener noreferrer">
                  {isPortfolioImageUrl(item.mediaUrl) ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.mediaUrl}
                      alt={item.title}
                      className="h-36 w-full object-cover bg-slate-100"
                    />
                  ) : (
                    <div className="flex h-36 items-center justify-center bg-slate-100 text-sm text-slate-muted">
                      View file
                    </div>
                  )}
                </a>
                <div className="p-3">
                  <p className="font-medium text-brand">{item.title}</p>
                  {item.description ? (
                    <p className="mt-1 text-xs text-slate-muted">{item.description}</p>
                  ) : null}
                  <Link
                    href={item.mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-accent hover:underline"
                  >
                    Open ↗
                  </Link>
                  {canEdit ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 text-red-600"
                      disabled={busy}
                      onClick={() => void removePortfolioItem(item.id)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-muted">No portfolio work added for team view yet.</p>
        )}

        {canEdit ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-3 space-y-2">
            <p className="text-sm font-medium text-brand">Upload work sample</p>
            <p className="text-xs text-slate-muted">
              JPEG, PNG, WebP, or GIF — max 8 MB each.
            </p>
            <Input
              label="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Bridal HD — Jaipur"
            />
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text">Image file</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand"
                onChange={(e) => {
                  setNewFile(e.target.files?.[0] ?? null);
                  setUploadError(null);
                }}
              />
              {newFile ? (
                <span className="text-xs text-slate-muted">
                  Selected: {newFile.name} ({(newFile.size / 1024).toFixed(0)} KB)
                </span>
              ) : null}
            </label>
            <Input
              label="Caption (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            {uploadError ? (
              <p className="text-sm text-red-600">{uploadError}</p>
            ) : null}
            <Button
              size="sm"
              disabled={busy || !newTitle.trim() || !newFile}
              onClick={() => void addPortfolioItem()}
            >
              {busy ? "Uploading…" : "Upload to portfolio"}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
