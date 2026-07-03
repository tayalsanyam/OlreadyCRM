"use client";

import { Suspense } from "react";
import { AssignLeadsWorkspace } from "@/components/admin/assign-workspace/AssignLeadsWorkspace";

function AssignLeadsFallback() {
  return <div className="h-48 animate-pulse rounded-xl bg-slate-200" />;
}

export default function AssignLeadsPage() {
  return (
    <Suspense fallback={<AssignLeadsFallback />}>
      <AssignLeadsWorkspace />
    </Suspense>
  );
}
