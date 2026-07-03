import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/phone";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: ticketId } = await params;

  const data = await withTransaction(async (tx) => {
    const [ticket] = await tx<{ muaId: string | null; createdAt: string }[]>`
      SELECT mua_id AS "muaId", created_at AS "createdAt"
      FROM support.tickets WHERE id = ${ticketId}::uuid
    `;
    if (!ticket?.muaId) return { calls: [], phones: [] as string[] };

    const [mua] = await tx<{ phone: string | null; alternatePhone: string | null; businessManagerPhone: string | null }[]>`
      SELECT phone, alternate_phone AS "alternatePhone", business_manager_phone AS "businessManagerPhone"
      FROM muas WHERE id = ${ticket.muaId}::uuid
    `;

    const phones = [mua?.phone, mua?.alternatePhone, mua?.businessManagerPhone]
      .map((p) => (p ? normalizePhone(p) : ""))
      .filter((p) => p.length >= 10);

    if (!phones.length) return { calls: [], phones: [] };

    const calls = await tx`
      SELECT
        cl.id,
        cl.called_at AS "calledAt",
        cl.direction,
        cl.duration_sec AS "durationSec",
        cl.outcome,
        cl.recording_url AS "recordingUrl",
        s.name AS "staffName",
        cl.client_phone AS "clientPhone",
        (cl.called_at >= ${ticket.createdAt}::timestamptz) AS "afterTicket"
      FROM call_logs cl
      LEFT JOIN rm.staff s ON s.id = cl.staff_id
      WHERE cl.mua_id = ${ticket.muaId}::uuid
         OR RIGHT(REGEXP_REPLACE(COALESCE(cl.client_phone, ''), '\\D', '', 'g'), 10) = ANY(${phones})
      ORDER BY cl.called_at DESC
      LIMIT 50
    `;

    return { calls, phones };
  });

  return NextResponse.json({ data, error: null });
}
