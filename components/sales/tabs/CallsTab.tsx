"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";

type CallRow = {
  id: string;
  source: "callyzer" | "manual";
  direction?: string | null;
  durationSec?: number | null;
  calledAt?: string | null;
  outcome?: string | null;
  recordingUrl?: string | null;
  description?: string | null;
};

function formatDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export function CallsTab({
  calls,
  onSuggestNotConnected,
}: {
  calls: CallRow[];
  onSuggestNotConnected?: () => void;
}) {
  const stats = useMemo(() => {
    const outbound = calls.filter((c) => (c.direction ?? "outbound") === "outbound");
    const answered = outbound.filter((c) => {
      const o = (c.outcome ?? "").toLowerCase();
      return o.includes("answer") && !o.includes("no");
    });
    const totalDuration = calls.reduce((sum, c) => sum + (c.durationSec ?? 0), 0);
    return {
      total: calls.length,
      outbound: outbound.length,
      answerRate: outbound.length ? Math.round((answered.length / outbound.length) * 100) : 0,
      avgDuration: calls.length ? Math.round(totalDuration / calls.length) : 0,
    };
  }, [calls]);

  const suggestNotConnected = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = calls.filter((c) => c.calledAt && new Date(c.calledAt).getTime() >= weekAgo);
    const outboundNoAnswer = recent.filter((c) => {
      if ((c.direction ?? "outbound") !== "outbound") return false;
      const o = (c.outcome ?? "").toLowerCase();
      return o.includes("no answer") || o.includes("voicemail") || o.includes("not");
    });
    const answered = recent.some((c) => (c.outcome ?? "").toLowerCase().includes("answer"));
    return outboundNoAnswer.length >= 3 && !answered;
  }, [calls]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Total calls</p><p className="text-lg font-semibold text-brand">{stats.total}</p></div>
        <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Outbound</p><p className="text-lg font-semibold text-brand">{stats.outbound}</p></div>
        <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Answer rate</p><p className="text-lg font-semibold text-brand">{stats.answerRate}%</p></div>
        <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Avg duration</p><p className="text-lg font-semibold text-brand">{formatDuration(stats.avgDuration)}</p></div>
      </div>

      {suggestNotConnected ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          3 or more unanswered outbound calls in the last 7 days. Consider moving this MUA to Not Connected.
          {onSuggestNotConnected ? (
            <div className="mt-2">
              <Button size="sm" variant="secondary" onClick={onSuggestNotConnected}>Move to Not Connected</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {calls.length === 0 ? (
        <p className="text-sm text-slate-muted">No call activity logged yet.</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Source</TH>
              <TH>Direction</TH>
              <TH>Duration</TH>
              <TH>Outcome</TH>
              <TH>Recording</TH>
            </TR>
          </THead>
          <TBody>
            {calls.map((c) => (
              <TR key={c.id}>
                <TD>{c.calledAt ? new Date(c.calledAt).toLocaleString("en-IN") : "—"}</TD>
                <TD><Badge variant="muted">{c.source === "callyzer" ? "Callyzer" : "Manual"}</Badge></TD>
                <TD>{c.direction ?? "—"}</TD>
                <TD>{formatDuration(c.durationSec)}</TD>
                <TD>{c.outcome ?? c.description ?? "—"}</TD>
                <TD>{c.recordingUrl ? <a className="text-accent hover:underline" href={c.recordingUrl} target="_blank" rel="noreferrer">Open</a> : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
