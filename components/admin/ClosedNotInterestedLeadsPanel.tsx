"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { VerifyLeadSlideOver } from "@/components/upload/VerifyLeadSlideOver";
import { UploaderNoteModal } from "@/components/upload/UploaderNoteModal";
import { UploaderConfirmNiModal } from "@/components/upload/UploaderConfirmNiModal";
import { ReactivateLeadModal } from "@/components/upload/ReactivateLeadModal";
import { LeadCommsLogModal } from "@/components/leads/LeadCommsLogModal";
import { LeadQuickContact } from "@/components/leads/LeadQuickContact";
import { useToast } from "@/components/ui/Toast";
import {
  EXIT_MARKED_BY_LABELS,
  LEAD_EXIT_LABELS,
  UPLOADER_CONFIRMATION_FILTER_LABELS,
  UPLOADER_CONFIRMATION_LABELS,
  type ExitMarkedByRole,
  type ExitSourceFilter,
  type UploaderConfirmationFilter,
} from "@/lib/lead-exit";
import { BUDGET_TIER_LABELS, type BrideLead } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type NiLeadRow = BrideLead & {
  handoverReason?: string | null;
  hostileNote?: string | null;
  exitMarkedByRole?: string | null;
  uploaderConfirmation?: string | null;
  assignedRmName?: string | null;
};

function exitMarkedByLabel(role: string | null | undefined): string | null {
  if (!role || !(role in EXIT_MARKED_BY_LABELS)) return null;
  return EXIT_MARKED_BY_LABELS[role as ExitMarkedByRole];
}

export function ClosedNotInterestedLeadsPanel({
  title = "Closed (not interested)",
  description = "Archived as not interested — confirm closures, view activity, or reactivate leads back into the verified pool.",
  embedded = false,
}: {
  title?: string;
  description?: string;
  embedded?: boolean;
}) {
  const { toast } = useToast();
  const [leads, setLeads] = useState<NiLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [exitSourceFilter, setExitSourceFilter] = useState<ExitSourceFilter>("all");
  const [appliedExitSource, setAppliedExitSource] = useState<ExitSourceFilter>("all");
  const [confirmationFilter, setConfirmationFilter] =
    useState<UploaderConfirmationFilter>("all");
  const [appliedConfirmation, setAppliedConfirmation] =
    useState<UploaderConfirmationFilter>("all");
  const [verifyLead, setVerifyLead] = useState<NiLeadRow | null>(null);
  const [confirmLead, setConfirmLead] = useState<NiLeadRow | null>(null);
  const [noteLead, setNoteLead] = useState<NiLeadRow | null>(null);
  const [reactivateLead, setReactivateLead] = useState<NiLeadRow | null>(null);
  const [logLead, setLogLead] = useState<NiLeadRow | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ tab: "not_interested" });
    if (appliedSearch.trim()) qs.set("q", appliedSearch.trim());
    if (appliedExitSource !== "all") qs.set("source", appliedExitSource);
    if (appliedConfirmation !== "all") qs.set("confirmation", appliedConfirmation);
    void fetch(`/api/upload/leads?${qs}`)
      .then(async (r) => {
        const json = (await r.json()) as { data: NiLeadRow[] | null; error?: string | null };
        if (!r.ok) {
          toast(json.error ?? "Failed to load leads");
          setLeads([]);
          return;
        }
        setLeads(json.data ?? []);
      })
      .catch(() => {
        toast("Failed to load leads");
        setLeads([]);
      })
      .finally(() => setLoading(false));
  }, [appliedSearch, appliedExitSource, appliedConfirmation, toast]);

  useEffect(() => {
    load();
  }, [load]);

  function applyFilters() {
    setAppliedSearch(searchQ.trim());
    setAppliedExitSource(exitSourceFilter);
    setAppliedConfirmation(confirmationFilter);
  }

  const filtersDirty =
    searchQ.trim() !== appliedSearch ||
    exitSourceFilter !== appliedExitSource ||
    confirmationFilter !== appliedConfirmation;

  const hasFiltersApplied =
    appliedSearch || appliedExitSource !== "all" || appliedConfirmation !== "all";

  return (
    <div className="space-y-6">
      {!embedded ? (
        <div>
          <h1 className="text-2xl font-bold text-brand">{title}</h1>
          <p className="text-sm text-slate-muted">{description}</p>
        </div>
      ) : (
        <p className="text-sm text-slate-muted">{description}</p>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1 max-w-md">
            <Input
              label="Search closed (not interested)"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="Name, city, or phone"
            />
          </div>
          <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
            <span className="text-slate-muted">Closed by</span>
            <select
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={exitSourceFilter}
              onChange={(e) => setExitSourceFilter(e.target.value as ExitSourceFilter)}
            >
              <option value="all">Anyone</option>
              {(
                ["regional_rm", "commission_rm", "lead_uploader", "admin", "owner"] as ExitMarkedByRole[]
              ).map((key) => (
                <option key={key} value={key}>
                  {EXIT_MARKED_BY_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[12rem] flex-col gap-1 text-sm">
            <span className="text-slate-muted">Confirmation</span>
            <select
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={confirmationFilter}
              onChange={(e) =>
                setConfirmationFilter(e.target.value as UploaderConfirmationFilter)
              }
            >
              {(Object.keys(UPLOADER_CONFIRMATION_FILTER_LABELS) as UploaderConfirmationFilter[]).map(
                (key) => (
                  <option key={key} value={key}>
                    {UPLOADER_CONFIRMATION_FILTER_LABELS[key]}
                  </option>
                )
              )}
            </select>
          </label>
          <Button variant="secondary" disabled={!filtersDirty} onClick={applyFilters}>
            Apply filters
          </Button>
          {hasFiltersApplied && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearchQ("");
                setExitSourceFilter("all");
                setConfirmationFilter("all");
                setAppliedSearch("");
                setAppliedExitSource("all");
                setAppliedConfirmation("all");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
      ) : leads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-muted">
          No closed not-interested leads
        </p>
      ) : (
        <div className="space-y-2">
          {leads.map((l) => (
            <article
              key={l.id}
              className="rounded-xl border border-slate-200 border-l-4 border-l-amber-400 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/rm/leads/${l.id}`}
                    className="font-semibold text-brand hover:text-accent hover:underline"
                  >
                    {l.brideName}
                  </Link>
                  <p className="font-mono text-[11px] text-slate-muted">{l.displayId}</p>
                  <p className="mt-1 text-xs text-slate-muted capitalize">
                    {l.city}
                    {l.region ? ` · ${l.region}` : ""}
                  </p>
                  <p className="mt-2 text-xs text-slate-muted">
                    {l.source ?? "—"}
                    <span className="mx-1.5 text-slate-300">·</span>
                    Event {l.eventDate ? formatDate(l.eventDate) : "—"}
                    <span className="mx-1.5 text-slate-300">·</span>
                    {BUDGET_TIER_LABELS[l.budgetTier] ?? l.budgetTier}
                  </p>
                  <div className="mt-2 text-xs text-amber-900">
                    {exitMarkedByLabel(l.exitMarkedByRole) ? (
                      <Badge variant="muted" className="mb-1 mr-1">
                        Closed by {exitMarkedByLabel(l.exitMarkedByRole)}
                      </Badge>
                    ) : null}
                    <span>{l.handoverReason ?? "—"}</span>
                    {l.uploaderConfirmation ? (
                      <Badge variant="muted" className="ml-1">
                        {UPLOADER_CONFIRMATION_LABELS[
                          l.uploaderConfirmation as keyof typeof UPLOADER_CONFIRMATION_LABELS
                        ] ?? l.uploaderConfirmation}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <LeadQuickContact
                  leadId={l.id}
                  brideName={l.brideName}
                  phone={l.phone}
                  city={l.city}
                  variant="compact"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <Button size="sm" variant="secondary" onClick={() => setLogLead(l)}>
                  View log
                </Button>
                <Button size="sm" onClick={() => setReactivateLead(l)}>
                  {LEAD_EXIT_LABELS.reactivate}
                </Button>
                {l.uploaderConfirmation !== "confirmed_ni" ? (
                  <Button size="sm" onClick={() => setVerifyLead(l)}>
                    Re-verify
                  </Button>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => setConfirmLead(l)}>
                  {LEAD_EXIT_LABELS.reviewAndConfirm}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNoteLead(l)}>
                  Add note
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <VerifyLeadSlideOver
        open={!!verifyLead}
        onClose={() => setVerifyLead(null)}
        lead={verifyLead}
        reVerify
        priorContext={verifyLead?.handoverReason ?? null}
        onVerified={(outcome) => {
          toast(outcome === "not_interested" ? "Marked not interested" : "Lead re-verified");
          load();
        }}
      />

      <UploaderConfirmNiModal
        open={!!confirmLead}
        onClose={() => setConfirmLead(null)}
        leadId={confirmLead?.id ?? ""}
        brideName={confirmLead?.brideName ?? ""}
        handoverReason={confirmLead?.handoverReason}
        existingConfirmation={
          confirmLead?.uploaderConfirmation as import("@/lib/types").UploaderConfirmation | null
        }
        onSaved={() => {
          toast("Confirmation saved");
          load();
        }}
      />

      <UploaderNoteModal
        open={!!noteLead}
        onClose={() => setNoteLead(null)}
        leadId={noteLead?.id ?? ""}
        brideName={noteLead?.brideName ?? ""}
        onSaved={() => {
          toast("Note added");
          load();
        }}
      />

      <ReactivateLeadModal
        open={!!reactivateLead}
        onClose={() => setReactivateLead(null)}
        leadId={reactivateLead?.id ?? ""}
        brideName={reactivateLead?.brideName ?? ""}
        handoverReason={reactivateLead?.handoverReason}
        onConfirm={(note) => {
          if (!reactivateLead) return;
          if (note) {
            void fetch(`/api/upload/leads/${reactivateLead.id}/note`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ note: `${LEAD_EXIT_LABELS.reactivate}: ${note}` }),
            });
          }
          setVerifyLead(reactivateLead);
          setReactivateLead(null);
        }}
      />

      <LeadCommsLogModal
        open={!!logLead}
        onClose={() => setLogLead(null)}
        leadId={logLead?.id ?? ""}
        brideName={logLead?.brideName ?? ""}
        displayId={logLead?.displayId}
      />
    </div>
  );
}
