"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DayEndFormByTemplate } from "@/components/day-end/DayEndForm";
import { DAY_END_SUBMITTED_EVENT, useDayEndSubmit } from "@/components/day-end/day-end-shared";
import type { DayEndTemplateKey } from "@/lib/day-end";
import type { SessionUser } from "@/lib/types";
import {
  isCallyzerSyncInFlight,
  syncCallyzerCallsUnlessFresh,
  waitForCallyzerSyncInFlight,
} from "@/lib/callyzer-sync-client";
import { formatDate } from "@/lib/utils";

type FormData = {
  reportDate: string;
  templateKey: DayEndTemplateKey;
  existing: { submissionType: string; submittedAt: string } | null;
  payload: Record<string, unknown>;
};

export function DayEndPageClient({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(true);
  const [callyzerReady, setCallyzerReady] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>("Syncing Callyzer…");
  const [form, setForm] = useState<FormData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const initStarted = useRef(false);
  const { submit, saving } = useDayEndSubmit();

  const loadForm = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/me/day-end", { cache: "no-store" });
      const json = (await res.json()) as { data: FormData | null; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? "Failed to load");
      setForm(json.data);
      setPayload((json.data.payload ?? {}) as Record<string, unknown>);
    } catch (e) {
      setForm(null);
      setLoadError(e instanceof Error ? e.message : "Failed to load day end form");
    }
  }, []);

  const refreshCallyzer = useCallback(
    async (opts?: { reloadForm?: boolean; force?: boolean }) => {
      setSyncing(true);
      setCallyzerReady(false);
      setSyncNote(
        isCallyzerSyncInFlight()
          ? "Waiting for background Callyzer sync…"
          : "Syncing Callyzer…",
      );
      try {
        await waitForCallyzerSyncInFlight();
        const result = await syncCallyzerCallsUnlessFresh({
          extended: true,
          force: opts?.force,
          onProgress: ({ processedRecords, totalRecords }) => {
            if (totalRecords > 0) {
              setSyncNote(`Syncing Callyzer… ${processedRecords} / ~${totalRecords} calls`);
            } else {
              setSyncNote("Syncing Callyzer…");
            }
          },
        });
        setSyncNote(
          result.skippedAsFresh
            ? (result.message ?? "Callyzer up to date.")
            : result.inserted > 0
              ? `Callyzer refreshed — ${result.inserted} new call(s) pulled.`
              : (result.message ?? "Callyzer refreshed — up to date."),
        );
        if (opts?.reloadForm) {
          await loadForm();
        }
        setCallyzerReady(result.syncComplete !== false);
      } catch (e) {
        setSyncNote(e instanceof Error ? e.message : "Callyzer refresh failed");
        setCallyzerReady(false);
      } finally {
        setSyncing(false);
      }
    },
    [loadForm],
  );

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    void (async () => {
      setLoading(true);
      await refreshCallyzer({ reloadForm: false });
      await loadForm();
      setLoading(false);
    })();
  }, [refreshCallyzer, loadForm]);

  const submitBlocked = saving || syncing || !callyzerReady;

  async function handleSubmit(submissionType: "report" | "leave") {
    if (!form || submitBlocked) return;
    const ok = await submit({
      submissionType,
      payload: submissionType === "report" ? payload : undefined,
    });
    if (ok) {
      window.dispatchEvent(new CustomEvent(DAY_END_SUBMITTED_EVENT));
      router.refresh();
      await loadForm();
    }
  }

  if (loading && !form) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <p className="text-sm text-slate-muted">
          {syncNote ?? "Loading day end…"}
        </p>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        <p className="text-sm text-danger">{loadError ?? "Could not load day end form."}</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => void loadForm()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Day End Report</h1>
          <p className="text-sm text-slate-muted">
            {formatDate(form.reportDate)} · Callyzer must finish before you can submit.
          </p>
          {user.role === "salesTl" && (
            <p className="mt-1 text-sm text-slate-muted">
              Team compliance and history:{" "}
              <Link href="/sales/reports/day-end" className="text-accent hover:underline">
                Team Day End Reports
              </Link>
            </p>
          )}
          {syncNote && (
            <p
              className={`mt-1 text-xs ${callyzerReady ? "text-slate-muted" : "font-medium text-amber-800"}`}
            >
              {syncNote}
            </p>
          )}
          {form.existing && (
            <p className="mt-1 text-xs text-accent">
              Already submitted ({form.existing.submissionType}) at{" "}
              {formatDate(form.existing.submittedAt)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={syncing}
            onClick={() => void refreshCallyzer({ reloadForm: true, force: true })}
          >
            {syncing ? "Syncing…" : "Hard refresh Callyzer"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={syncing}
            onClick={() => void loadForm()}
          >
            Reload auto-pick
          </Button>
        </div>
      </div>

      <fieldset disabled={submitBlocked} className="space-y-6 disabled:opacity-60">
        <DayEndFormByTemplate
          templateKey={form.templateKey}
          payload={payload}
          onChange={setPayload}
        />

        <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4">
          <Button type="button" disabled={submitBlocked} onClick={() => void handleSubmit("report")}>
            {saving ? "Saving…" : syncing || !callyzerReady ? "Waiting for Callyzer…" : "Submit day end"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={submitBlocked}
            onClick={() => void handleSubmit("leave")}
          >
            Mark on leave
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
