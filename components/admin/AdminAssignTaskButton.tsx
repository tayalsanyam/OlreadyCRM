"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CreateOpsTaskSlideOver } from "@/components/admin/CreateOpsTaskSlideOver";

export function AdminAssignTaskButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Assign task
      </Button>
      <CreateOpsTaskSlideOver
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => setOpen(false)}
        createApiPath="/api/admin/ops-tasks"
      />
    </>
  );
}
