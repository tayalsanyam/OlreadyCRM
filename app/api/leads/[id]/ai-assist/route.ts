import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { withTransaction } from "@/db/index";
import { buildLeadAiContext } from "@/lib/lead-ai-context";
import { runRmAiAssist } from "@/lib/rm-ai";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const allowed = new Set([
    "regionalRm",
    "commissionRm",
    "leadUploader",
    "admin",
    "owner",
  ]);
  if (!allowed.has(auth.session.role)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const access = await getLeadForAccess(id);
  if (!access) return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  if (!canAccessLead(auth.session, access)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    context?: "verification" | "makeup" | "general";
  };
  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ data: null, error: "message is required" }, { status: 400 });
  }

  const [lead] = await sql<{ brideName: string; city: string; region: string; status: string }[]>`
    SELECT bride_name AS "brideName", city, region::text AS region, status::text AS status
    FROM bride_leads WHERE id = ${id}::uuid
  `;

  const leadContextBlock = await buildLeadAiContext(sql, id);

  const result = await withTransaction((tx) =>
    runRmAiAssist(tx, {
      message,
      context: body.context,
      lead: lead ?? null,
      leadContextBlock,
    }),
  );

  return NextResponse.json({
    data: {
      reply: result.reply,
      docNames: result.docNames,
    },
    error: null,
  });
}
