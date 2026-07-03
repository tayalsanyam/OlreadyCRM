import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import {
  applyUploaderLeadDetailsUpdate,
  type UploaderLeadDetailsPayload,
} from "@/lib/upload-lead-update";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const payload = (await request.json().catch(() => ({}))) as UploaderLeadDetailsPayload;

  try {
    await withTransaction(async (tx) => {
      const [lead] = await tx<{ verified: boolean }[]>`
        SELECT verified FROM bride_leads WHERE id = ${id}::uuid
      `;
      if (!lead) throw new Error("Lead not found");
      if (!lead.verified) throw new Error("Only verified leads can be edited here");

      await applyUploaderLeadDetailsUpdate(tx, {
        leadId: id,
        payload,
        actorId: auth.session.userId,
      });
    });
    return NextResponse.json({ data: { ok: true }, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
