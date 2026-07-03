"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { CreateCareTaskSlideOver } from "@/components/grievances/CreateCareTaskSlideOver";

export function AdminInterjectionBar({
  ticketId,
  assignedAdminName,
  onUpdated,
}: {
  ticketId: string;
  assignedAdminName?: string | null;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [directive, setDirective] = useState("");
  const [loading, setLoading] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const post = async (action: "take_ownership" | "add_directive", extra?: Record<string, string>) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/tickets/${ticketId}/interject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Action failed", "error");
        return;
      }
      toast("Updated");
      onUpdated();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="border-brand/20 bg-brand/5 p-4">
        <h2 className="mb-2 text-sm font-semibold text-brand">Admin controls</h2>
        {assignedAdminName && (
          <p className="mb-2 text-xs text-slate-muted">
            You are watching this ticket — assign follow-up tasks or add directives below.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={loading} onClick={() => post("take_ownership")}>
            Take ownership
          </Button>
          <Button size="sm" variant="secondary" disabled={loading} onClick={() => setTaskOpen(true)}>
            Assign task
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            placeholder="Directive to care team…"
            value={directive}
            onChange={(e) => setDirective(e.target.value)}
            className="min-w-[200px] flex-1"
          />
          <Button
            size="sm"
            disabled={loading || !directive.trim()}
            onClick={() => {
              void post("add_directive", { directive });
              setDirective("");
            }}
          >
            Add directive
          </Button>
        </div>
      </Card>

      <CreateCareTaskSlideOver
        ticketId={ticketId}
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        onCreated={onUpdated}
      />
    </>
  );
}
