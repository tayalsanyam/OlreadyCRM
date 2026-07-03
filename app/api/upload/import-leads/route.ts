import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import {
  importLeadRows,
  type ImportLeadPayload,
} from "@/lib/import-lead-batch";

export type { ImportLeadPayload };

export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as { rows?: ImportLeadPayload[] };
  if (!body.rows?.length) {
    return NextResponse.json({ data: null, error: "rows required" }, { status: 400 });
  }

  if (USE_MOCK) {
    const result = mockStore.importValidatedLeads(
      body.rows.map((r) => ({ ...r, eventDate: r.eventDate ?? null })),
      { id: auth.session.userId, name: auth.session.name },
    );
    return NextResponse.json({ data: result, error: null });
  }

  try {
    const result = await importLeadRows(body.rows, {
      id: auth.session.userId,
      name: auth.session.name,
    });
    return NextResponse.json({
      data: result,
      error: null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
