import { NextResponse } from "next/server";
import { appendComm, withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { COMM } from "@/lib/comm-types";
import { USE_MOCK } from "@/lib/mock-data";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as { note?: string };
  const note = body.note?.trim() ?? "";
  if (note.length < 10) {
    return NextResponse.json(
      { data: null, error: "Note must be at least 10 characters" },
      { status: 400 }
    );
  }

  if (USE_MOCK) {
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  await withTransaction(async (tx) => {
    const [lead] = await tx<{ id: string }[]>`
      SELECT id FROM bride_leads WHERE id = ${id}::uuid
    `;
    if (!lead) throw new Error("Lead not found");
    await appendComm(tx, {
      leadId: id,
      entryType: COMM.note,
      description: `Uploader note: ${note}`,
      actorId: auth.session.userId,
    });
  });

  return NextResponse.json({ data: { ok: true }, error: null });
}
