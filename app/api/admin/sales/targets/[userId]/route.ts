import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { setAuditActor, withTransaction } from "@/db/index";

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const { userId } = await params;
  const month = new URL(request.url).searchParams.get("month");
  if (!month) return NextResponse.json({ data: null, error: "month query is required" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as any;

  const data = await withTransaction(async (tx) => {
    await setAuditActor(tx, auth.session.userId);
    await tx`
      INSERT INTO sales.targets (user_id, month, set_by)
      VALUES (${userId}::uuid, ${month}, ${auth.session.userId}::uuid)
      ON CONFLICT (user_id, month) DO NOTHING
    `;

    await tx`
      UPDATE sales.targets
      SET target_revenue = ${body.targetRevenue ?? null},
          target_potential_calls = ${body.targetPotentialCalls ?? null},
          target_potential_sold = ${body.targetPotentialSold ?? null},
          target_existing_calls = ${body.targetExistingCalls ?? null},
          target_existing_sold = ${body.targetExistingSold ?? null},
          plan_targets = ${tx.json(body.planTargets ?? null)},
          min_calls_per_day = ${body.minCallsPerDay ?? null},
          min_talk_time_min_per_day = ${body.minTalkTimeMinPerDay ?? null},
          set_by = ${auth.session.userId}::uuid
      WHERE user_id = ${userId}::uuid AND month = ${month}
    `;

    const [row] = await tx`SELECT * FROM sales.targets WHERE user_id = ${userId}::uuid AND month = ${month}`;
    return row;
  });

  return NextResponse.json({ data, error: null });
}
