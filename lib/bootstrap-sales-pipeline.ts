import type { TransactionSql } from "@/db/index";
import { adminAssignPipeline } from "@/lib/admin-sales-pipeline-assign";
import { loadActiveSalesPipelineAssignee } from "@/lib/sales-pipeline-assignee";
import {
  createUnassignedSalesPipeline,
  muaHasActiveSalesPipeline,
  muaHasRejectedSalesPipeline,
} from "@/lib/sales-pipeline-bootstrap";

export type BootstrapSalesPipelineResult = {
  created: Array<{ muaId: string; pipelineId: string }>;
  assigned: number;
  skipped: Array<{ muaId: string; reason: string }>;
};

export async function bootstrapSalesPipelinesForMuas(
  tx: TransactionSql,
  muaIds: string[],
  opts: {
    actorId: string;
    salesRmId?: string | null;
    assigneeName?: string;
  },
): Promise<BootstrapSalesPipelineResult> {
  const created: BootstrapSalesPipelineResult["created"] = [];
  const skipped: BootstrapSalesPipelineResult["skipped"] = [];
  let assigned = 0;

  let assigneeName = opts.assigneeName;
  if (opts.salesRmId && !assigneeName) {
    const assignee = await loadActiveSalesPipelineAssignee(tx, opts.salesRmId);
    if (!assignee) {
      throw Object.assign(new Error("Invalid salesperson"), { status: 400 });
    }
    assigneeName = assignee.name;
  }

  for (const muaId of muaIds) {
    const [mua] = await tx<{ id: string; name: string; status: string }[]>`
      SELECT id, name, status::text AS status FROM muas WHERE id = ${muaId}::uuid
    `;
    if (!mua) {
      skipped.push({ muaId, reason: "MUA not found" });
      continue;
    }

    const hasPipeline = await muaHasActiveSalesPipeline(tx, muaId);
    if (hasPipeline) {
      if (await muaHasRejectedSalesPipeline(tx, muaId)) {
        skipped.push({
          muaId,
          reason: "In rejected queue — re-assign or junk from Rejected MUAs first",
        });
        continue;
      }
      if (opts.salesRmId) {
        const [pipe] = await tx<{ id: string; assignedTo: string | null }[]>`
          SELECT id, assigned_to AS "assignedTo"
          FROM sales.pipeline
          WHERE mua_id = ${muaId}::uuid
            AND status = 'active'
            AND stage <> 'Rejected'
          LIMIT 1
        `;
        if (pipe && !pipe.assignedTo && mua.status === "active") {
          await adminAssignPipeline(tx, {
            pipelineId: pipe.id,
            salesRmId: opts.salesRmId,
            actorId: opts.actorId,
            assigneeName: assigneeName!,
            wasUnassigned: true,
          });
          assigned++;
        } else if (pipe && !pipe.assignedTo && mua.status === "inactive") {
          skipped.push({ muaId, reason: "MUA is inactive — activate before assigning" });
        } else if (pipe?.assignedTo) {
          skipped.push({ muaId, reason: "Already has assigned salesperson" });
        } else {
          skipped.push({ muaId, reason: "Active pipeline exists" });
        }
      } else {
        skipped.push({ muaId, reason: "Already in sales pipeline" });
      }
      continue;
    }

    const boot = await createUnassignedSalesPipeline(tx, {
      muaId,
      actorId: opts.actorId,
      muaName: mua.name,
    });
    if (!boot) {
      skipped.push({ muaId, reason: "Could not create pipeline" });
      continue;
    }

    created.push({ muaId, pipelineId: boot.pipelineId });

    if (opts.salesRmId && assigneeName && mua.status === "active") {
      await adminAssignPipeline(tx, {
        pipelineId: boot.pipelineId,
        salesRmId: opts.salesRmId,
        actorId: opts.actorId,
        assigneeName,
        wasUnassigned: true,
      });
      assigned++;
    }
  }

  return { created, assigned, skipped };
}
