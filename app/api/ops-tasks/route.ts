import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { createOpsTask, searchBrideLeadsForOpsTask, searchMuasForOpsTask } from "@/lib/ops-task";

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    assignedTo?: string;
    muaId?: string | null;
    leadId?: string | null;
    dueAt?: string | null;
    parentTaskId?: string | null;
  };

  if (!body.title?.trim() || !body.assignedTo) {
    return NextResponse.json(
      { data: null, error: "title and assignedTo are required" },
      { status: 400 },
    );
  }

  try {
    const data = await withTransaction(async (tx) =>
      createOpsTask(tx, {
        title: body.title!,
        description: body.description,
        assignedTo: body.assignedTo!,
        assignedBy: auth.session.userId,
        muaId: body.muaId,
        leadId: body.leadId,
        dueAt: body.dueAt,
        parentTaskId: body.parentTaskId,
      }),
    );
    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create task";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "mua";
  const q = searchParams.get("q") ?? "";

  const data = await withTransaction(async (tx) => {
    if (type === "bride") {
      return { brides: await searchBrideLeadsForOpsTask(tx, q) };
    }
    return { muas: await searchMuasForOpsTask(tx, q) };
  });

  return NextResponse.json({ data, error: null });
}
