"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type PipelineOption = { id: string; muaName: string; stage: string; muaCity: string; muaType: string };
type ChatMessage = { role: "user" | "assistant"; content: string };

export function AIChatPanel({
  presetPipelineId,
  compact = false,
}: {
  presetPipelineId?: string;
  compact?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pipelineId, setPipelineId] = useState(presetPipelineId ?? "");
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [usedDocs, setUsedDocs] = useState<string[]>([]);

  useEffect(() => {
    void fetch("/api/sales/pipeline")
      .then((r) => r.json())
      .then((j: { data?: any[] }) => {
        const rows = (j.data ?? []).slice(0, 200).map((r) => ({
          id: r.id,
          muaName: r.muaName,
          stage: r.stage,
          muaCity: r.muaCity,
          muaType: r.muaType,
        }));
        setPipelines(rows);
      });
  }, []);

  const selectedPipeline = useMemo(() => pipelines.find((p) => p.id === pipelineId) ?? null, [pipelineId, pipelines]);
  const quickPrompts = useMemo(() => {
    if (compact) {
      return [
        "Draft 3 WhatsApp follow-up options for this MUA and stage.",
        "Draft 2 SMS options for this MUA and stage (short + direct).",
        "Draft a sales follow-up email with subject + body for this MUA and stage.",
        "Give objection handling lines for pricing and lead quality concerns.",
        "Give a 60-second call pitch based on current stage and next CTA.",
      ];
    }
    return [
      "Draft a WhatsApp follow-up for this stage",
      "Handle objection: leads quality concern",
      "Give a 3-step call script for conversion",
      "Suggest next-touch CTA for tomorrow",
    ];
  }, [compact]);

  async function send(customMessage?: string) {
    const outgoing = (customMessage ?? message).trim();
    if (!outgoing || loading) return;
    const nextHistory = [...history, { role: "user" as const, content: outgoing }];
    setHistory(nextHistory);
    setMessage("");
    setLoading(true);

    const res = await fetch("/api/sales/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: outgoing,
        pipelineId: pipelineId || undefined,
        history: history.slice(-8),
      }),
    });
    const json = (await res.json()) as { data?: { reply?: string; context?: { usedDocs?: string[] } }; error?: string | null };
    const reply = json.data?.reply ?? json.error ?? "No response";
    setUsedDocs(json.data?.context?.usedDocs ?? []);
    setHistory((prev) => [...prev, { role: "assistant", content: reply }]);
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className={`${compact ? "text-base" : "text-2xl"} font-bold text-brand`}>AI Sales Assistant</h1>
        <Badge variant="muted">Context-aware</Badge>
      </div>

      {!presetPipelineId ? (
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">MUA Context</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
            >
              <option value="">No specific pipeline</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.muaName} · {p.stage} · {p.muaCity}
                </option>
              ))}
            </select>
            {selectedPipeline ? <Badge>{selectedPipeline.muaType}</Badge> : null}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{compact ? "Live Call Prompts" : "Quick Prompts"}</p>
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((q) => (
            <Button key={q} size="sm" variant="secondary" onClick={() => void send(q)}>
              {q}
            </Button>
          ))}
        </div>
      </div>

      <div className={`${compact ? "max-h-[260px]" : "max-h-[420px]"} space-y-2 overflow-auto rounded-lg border border-slate-200 p-3`}>
        {history.length === 0 ? (
          <p className="text-sm text-slate-muted">No messages yet. Ask for objection handling, WhatsApp drafts, or call scripts.</p>
        ) : (
          history.map((m, idx) => (
            <div key={idx} className={`rounded-lg p-3 text-sm ${m.role === "user" ? "bg-slate-100" : "bg-emerald-50"}`}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{m.role}</p>
              <p className="whitespace-pre-wrap text-text">{m.content}</p>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <textarea
          className="min-h-28 w-full rounded-lg border border-slate-200 p-3 text-sm"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask for pitch/WhatsApp/objection handling..."
        />
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-slate-muted">
            {usedDocs.length ? `Docs used: ${usedDocs.join(", ")}` : "No docs referenced yet"}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setHistory([])}>Clear chat</Button>
            <Button onClick={() => void send()} disabled={!message.trim() || loading}>
              {loading ? "Thinking..." : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
