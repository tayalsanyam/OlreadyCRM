"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CreateOpsTaskSlideOver } from "@/components/admin/CreateOpsTaskSlideOver";
import { OpsTaskCompleteModal } from "@/components/ops/OpsTaskCompleteModal";
import { OpsTaskAttachmentsPanel } from "@/components/ops/OpsTaskAttachmentsPanel";
import { formatDate } from "@/lib/utils";
import {
  isUploaderReverifyTaskTitle,
  uploaderReverifyLeadUrl,
} from "@/lib/uploader-reverify-task";

type FollowUp = {
  id: string;
  displayId: string;
  status: string;
  assigneeName: string;
  dueAt: string | null;
  createdAt: string;
};

type Detail = {
  id: string;
  displayId: string;
  title: string;
  description: string | null;
  status: string;
  assignedTo: string;
  muaId: string | null;
  muaName: string | null;
  muaDisplayId: string | null;
  leadId: string | null;
  brideName: string | null;
  brideDisplayId: string | null;
  dueAt: string | null;
  assignedByName: string;
  assigneeName: string;
  completionNotes: string | null;
  completionOutcome: string | null;
  endRateLabel: string | null;
  completedAt: string | null;
  completedByName: string | null;
  canComplete: boolean;
  canCreateFollowUp: boolean;
  access: string;
  followUps: FollowUp[];
};

export function OpsTaskWorkspaceClient({ taskId }: { taskId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignerView = searchParams.get("view") === "assigned";
  const fromAdmin = searchParams.get("from") === "admin";

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [attachKey, setAttachKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void fetch(`/api/my/ops-tasks/${taskId}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) {
          setError(j.error ?? "Not found");
          setDetail(null);
        } else {
          setDetail(j.data);
          setError(null);
        }
      })
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!detail?.leadId || !isUploaderReverifyTaskTitle(detail.title)) return;
    router.replace(uploaderReverifyLeadUrl(detail.leadId));
  }, [detail, router]);

  if (loading) return <p className="text-slate-muted">Loading…</p>;

  if (detail?.leadId && isUploaderReverifyTaskTitle(detail.title)) {
    return <p className="text-slate-muted">Opening lead re-verification…</p>;
  }

  if (error || !detail) {
    return (
      <div>
        <p className="text-red-600">{error ?? "Task not found"}</p>
        <Link href="/rm/tasks" className="text-sm text-brand">
          Back to tasks
        </Link>
      </div>
    );
  }

  const backHref = fromAdmin
    ? assignerView
      ? "/admin/tasks?tab=assignments&opsView=assigned"
      : "/admin/tasks?tab=assignments&opsView=mine"
    : assignerView
      ? "/rm/tasks?tab=team&teamView=assigned"
      : "/rm/tasks?tab=team";
  const backLabel = assignerView ? "Back to assigned tasks" : "Back to my tasks";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={backHref} className="text-sm text-brand hover:underline">
        ← {backLabel}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">{detail.displayId}</h1>
          <p className="text-sm text-slate-muted">
            {assignerView || detail.access === "assigner"
              ? `Assigned to ${detail.assigneeName}`
              : `Assigned by ${detail.assignedByName}`}
          </p>
        </div>
        {detail.canComplete && (
          <Button onClick={() => setCompleteOpen(true)}>Complete</Button>
        )}
        {detail.canCreateFollowUp && (
          <Button variant="secondary" onClick={() => setFollowUpOpen(true)}>
            Assign follow-up
          </Button>
        )}
      </div>

      <Card className="space-y-2 p-4">
        <h2 className="font-semibold text-brand">{detail.title}</h2>
        {detail.description && (
          <p className="whitespace-pre-wrap text-sm text-slate-700">{detail.description}</p>
        )}
        {detail.dueAt && (
          <p className="text-xs text-slate-muted">Due {formatDate(detail.dueAt)}</p>
        )}
      </Card>

      {(detail.muaName || detail.brideName) && (
        <Card className="p-4 text-sm">
          {detail.muaName && (
            <p>
              MUA: {detail.muaDisplayId} · {detail.muaName}
            </p>
          )}
          {detail.brideName && (
            <p>
              Bride: {detail.brideDisplayId} · {detail.brideName}
            </p>
          )}
        </Card>
      )}

      <Card className="p-4">
        <OpsTaskAttachmentsPanel
          taskId={detail.id}
          canUpload={detail.canComplete}
          refreshKey={attachKey}
        />
      </Card>

      {detail.completionNotes && (
        <Card className="p-4">
          <h2 className="mb-2 font-semibold text-brand">Completion</h2>
          {detail.endRateLabel && (
            <p className="text-sm font-medium">End result: {detail.endRateLabel}</p>
          )}
          {detail.completionOutcome && (
            <p className="text-sm text-slate-muted">{detail.completionOutcome}</p>
          )}
          <p className="mt-2 whitespace-pre-wrap text-sm">{detail.completionNotes}</p>
          {detail.completedByName && detail.completedAt && (
            <p className="mt-2 text-xs text-slate-muted">
              {detail.completedByName} · {formatDate(detail.completedAt.slice(0, 10))}
            </p>
          )}
        </Card>
      )}

      {detail.followUps.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-2 font-semibold text-brand">Follow-ups</h2>
          <ul className="space-y-2">
            {detail.followUps.map((f) => (
              <li key={f.id} className="text-sm">
                <Link
                  href={
                    assignerView
                      ? `/tasks/ops/${f.id}?view=assigned${fromAdmin ? "&from=admin" : ""}`
                      : `/tasks/ops/${f.id}${fromAdmin ? "?from=admin" : ""}`
                  }
                  className="font-mono text-brand hover:underline"
                >
                  {f.displayId}
                </Link>
                <span className="ml-2 text-slate-muted">
                  {f.status} · {f.assigneeName}
                  {f.dueAt ? ` · due ${formatDate(f.dueAt.slice(0, 10))}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <OpsTaskCompleteModal
        taskId={detail.id}
        displayId={detail.displayId}
        title={detail.title}
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        onCompleted={() => {
          load();
          setAttachKey((k) => k + 1);
        }}
        apiPath={
          fromAdmin
            ? `/api/admin/ops-tasks/${detail.id}`
            : `/api/my/ops-tasks/${detail.id}`
        }
        allowAttachments
      />

      {detail.canCreateFollowUp && (
        <CreateOpsTaskSlideOver
          open={followUpOpen}
          onClose={() => setFollowUpOpen(false)}
          onCreated={() => {
            load();
            setFollowUpOpen(false);
          }}
          parentTaskId={detail.id}
          defaultTitle={`Follow-up — ${detail.title}`}
          defaultAssignedTo={detail.assignedTo}
          defaultMuaId={detail.muaId}
          defaultLeadId={detail.leadId}
        />
      )}
    </div>
  );
}
