"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CreateOpsTaskSlideOver } from "@/components/admin/CreateOpsTaskSlideOver";
import { MyOpsTasksList } from "@/components/ops/MyOpsTasksList";
import { AssignedOpsTasksList } from "@/components/ops/AssignedOpsTasksList";
import { cn } from "@/lib/utils";

type View = "mine" | "assigned";

export function TeamTasksPanel({ initialView = "mine" }: { initialView?: "mine" | "assigned" }) {
  const [view, setView] = useState<View>(initialView);
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["mine", "My tasks"],
              ["assigned", "Assigned by me"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium",
                view === id ? "bg-brand text-white" : "bg-slate-100 text-slate-700",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          Assign task
        </Button>
      </div>
      <p className="text-sm text-slate-muted">
        {view === "mine"
          ? "Tasks assigned to you — complete with notes and optional file attachments."
          : "Tasks you assigned — see status, end result, completion notes, and assign follow-ups."}
      </p>
      {view === "mine" ? (
        <MyOpsTasksList refreshKey={refreshKey} />
      ) : (
        <AssignedOpsTasksList refreshKey={refreshKey} />
      )}
      <CreateOpsTaskSlideOver
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setRefreshKey((k) => k + 1);
          setView("assigned");
        }}
      />
    </div>
  );
}
