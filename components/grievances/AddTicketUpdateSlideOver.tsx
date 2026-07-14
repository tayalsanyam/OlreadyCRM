"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SlideOver } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
} from "@/lib/ticket-categories";
import { cn } from "@/lib/utils";

type Props = {
  ticketId: string;
  ticketNumber: string;
  open: boolean;
  onClose: () => void;
  onAdded?: () => void;
};

export function AddTicketUpdateSlideOver({
  ticketId,
  ticketNumber,
  open,
  onClose,
  onAdded,
}: Props) {
  const { toast } = useToast();
  const [updateText, setUpdateText] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [reopenIfClosed, setReopenIfClosed] = useState(true);
  const [loading, setLoading] = useState(false);

  const toggleCategory = (value: string) => {
    setCategories((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    );
  };

  const submit = async () => {
    if (updateText.trim().length < 10) {
      toast("Update must be at least 10 characters", "error");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/crm/tickets/${ticketId}/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updateText: updateText.trim(),
        categories: categories.length ? categories : undefined,
        reopenIfClosed,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast(json.error ?? "Failed to add update", "error");
      return;
    }
    toast("Update added");
    setUpdateText("");
    setCategories([]);
    onAdded?.();
    onClose();
  };

  return (
    <SlideOver open={open} onClose={onClose} title={`Add update — ${ticketNumber}`}>
      <div className="space-y-4">
        <p className="text-sm text-slate-muted">
          Add a follow-up issue or new information to this ticket instead of opening a duplicate.
        </p>

        <div>
          <p className="mb-2 text-sm font-medium">Additional issue types (optional)</p>
          <div className="grid gap-2">
            {TICKET_CATEGORIES.slice(0, 6).map((cat) => (
              <label
                key={cat.value}
                className={cn(
                  "flex cursor-pointer gap-2 rounded border p-2 text-sm",
                  categories.includes(cat.value) ? "border-brand bg-brand/5" : "border-slate-200"
                )}
              >
                <input
                  type="checkbox"
                  checked={categories.includes(cat.value)}
                  onChange={() => toggleCategory(cat.value)}
                />
                {TICKET_CATEGORY_LABELS[cat.value] ?? cat.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">What&apos;s new?</label>
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={6}
            value={updateText}
            onChange={(e) => setUpdateText(e.target.value)}
            placeholder="Describe the new issue or additional context…"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reopenIfClosed}
            onChange={(e) => setReopenIfClosed(e.target.checked)}
          />
          Reopen ticket if it was closed
        </label>

        <div className="flex gap-2">
          <Button onClick={submit} disabled={loading}>
            {loading ? "Saving…" : "Add update"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </SlideOver>
  );
}
