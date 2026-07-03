"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function LeadAIAssistPanel({
  leadId,
  defaultContext = "general",
}: {
  leadId: string;
  defaultContext?: "verification" | "makeup" | "general";
}) {
  const [message, setMessage] = useState("");
  const [context, setContext] = useState(defaultContext);
  const [reply, setReply] = useState<string | null>(null);
  const [docs, setDocs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function ask() {
    if (!message.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/leads/${leadId}/ai-assist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.trim(), context }),
    });
    const json = (await res.json()) as {
      data?: { reply?: string; docNames?: string[] };
      error?: string;
    };
    setBusy(false);
    if (!res.ok) {
      setReply(json.error ?? "Could not get suggestions");
      return;
    }
    setReply(json.data?.reply ?? "");
    setDocs(json.data?.docNames ?? []);
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
      <p className="text-sm font-semibold text-violet-950">AI assist (company docs)</p>
      <div className="flex flex-wrap gap-2">
        {(["verification", "makeup", "general"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setContext(c)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              context === c
                ? "border-violet-600 bg-violet-600 text-white"
                : "border-violet-200 bg-white text-violet-800"
            }`}
          >
            {c === "verification" ? "Verification" : c === "makeup" ? "Makeup" : "General"}
          </button>
        ))}
      </div>
      <textarea
        className="min-h-[64px] w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
        placeholder="e.g. Bride wants natural look but also full coverage — what should I ask?"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <Button size="sm" disabled={busy || !message.trim()} onClick={() => void ask()}>
        {busy ? "Thinking…" : "Suggest questions"}
      </Button>
      {reply ? (
        <div className="rounded-lg border border-violet-100 bg-white p-3 text-sm whitespace-pre-wrap text-text">
          {reply}
          {docs.length ? (
            <p className="mt-2 text-xs text-slate-muted">Docs: {docs.join(", ")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
