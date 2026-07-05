"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DealDiscountApprovalModal } from "@/components/admin/AdminTaskActions";

export function PendingDiscountAdminPanel({
  stageLogId,
  muaName,
  onResolved,
}: {
  stageLogId: string;
  muaName: string;
  onResolved: () => void;
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((r) => r.json())
      .then((j) => {
        const role = j?.data?.role as string | undefined;
        setIsAdmin(role === "admin" || role === "owner");
      });
  }, []);

  if (!isAdmin) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <p className="text-xs text-amber-950">
        Admin: this discount is still pending in the system (even if the CRM task was closed incorrectly).
      </p>
      <Button size="sm" onClick={() => setOpen(true)}>
        Approve or reject discount
      </Button>
      <DealDiscountApprovalModal
        stageLogId={stageLogId}
        displayId={muaName}
        title={`Approve deal discount — ${muaName}`}
        open={open}
        onClose={() => setOpen(false)}
        onCompleted={() => {
          setOpen(false);
          onResolved();
        }}
      />
    </div>
  );
}
