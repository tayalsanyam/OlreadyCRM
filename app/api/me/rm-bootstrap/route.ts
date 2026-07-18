import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";
import { ensureCommissionCollectionTasks } from "@/lib/commission-collection-tasks";
import { ensureLeadIntakeTasksForStaff } from "@/lib/lead-intake-tasks";
import { reconcileDueLeads } from "@/lib/lead-lifecycle";
import { USE_MOCK } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { session } = auth;
  if (session.role !== "regionalRm" && session.role !== "commissionRm") {
    return NextResponse.json({ data: { skipped: true }, error: null });
  }

  if (USE_MOCK) {
    return NextResponse.json({ data: { reconciled: true }, error: null });
  }

  try {
    const result = await withTransaction(async (tx) => {
      const reconcile = await reconcileDueLeads(tx);
      await ensureCommissionCollectionTasks(tx, {
        role: session.role,
        userId: session.userId,
      });
      await ensureLeadIntakeTasksForStaff(tx, session.userId);
      return reconcile;
    });
    return NextResponse.json({ data: result, error: null });
  } catch (e) {
    return apiErrorResponse(e, "RM session bootstrap failed");
  }
}
