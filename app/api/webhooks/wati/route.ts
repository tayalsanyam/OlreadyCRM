import { NextResponse } from "next/server";
import { sql, appendComm } from "@/db/index";
import { COMM } from "@/lib/comm-types";
import { normalizePhone } from "@/lib/phone";

export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  if (secret !== process.env.WATI_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    phone?: string;
    waId?: string;
    text?: string;
    leadId?: string;
  };

  const rawPhone = body.phone ?? body.waId ?? "";
  let leadId = body.leadId;
  if (!leadId && rawPhone) {
    const norm = normalizePhone(rawPhone);
    const [lead] = await sql<{ id: string }[]>`
      SELECT id FROM bride_leads
      WHERE regexp_replace(phone, '\\D', '', 'g') LIKE ${"%" + norm}
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    leadId = lead?.id;
  }

  if (!leadId) {
    return NextResponse.json({ data: { logged: false }, error: "Lead not found" });
  }

  const preview = body.text?.slice(0, 120) ?? "message";
  await appendComm(sql, {
    leadId,
    entryType: COMM.whatsappLogged,
    description: `Wati: ${preview}`,
    actorId: null,
    metadata: { source: "wati" },
  });

  return NextResponse.json({ data: { logged: true, leadId }, error: null });
}
