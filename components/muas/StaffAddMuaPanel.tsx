"use client";

import { useState } from "react";
import { AddMuaModal } from "@/components/admin/AddMuaModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function StaffAddMuaPanel() {
  const [open, setOpen] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-brand">Add MUA</h1>
        <p className="text-sm text-slate-muted">
          Create a new MUA on the roster. No bulk upload — one profile at a time, same fields as admin add.
        </p>
      </div>

      <Card className="space-y-4 p-6">
        <p className="text-sm text-slate-700">
          New MUAs are created active with an unassigned sales pipeline. Sales assignment is handled by admin.
        </p>
        {createdCount > 0 ? (
          <p className="text-sm font-medium text-emerald-700">
            {createdCount} MUA{createdCount === 1 ? "" : "s"} added this session.
          </p>
        ) : null}
        <div>
          <Button type="button" onClick={() => setOpen(true)}>
            Add MUA
          </Button>
        </div>
      </Card>

      <AddMuaModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => setCreatedCount((n) => n + 1)}
        audience="staff"
      />
    </>
  );
}
