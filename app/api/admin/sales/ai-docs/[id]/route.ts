import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["admin"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const { id } = await params;

  await withTransaction(async (tx) => {
    await tx`DELETE FROM sales.ai_documents WHERE id = ${id}::uuid`;
  });

  return NextResponse.json({ data: { ok: true }, error: null });
}
