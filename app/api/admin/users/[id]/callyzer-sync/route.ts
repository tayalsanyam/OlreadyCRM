import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import {
  formatCallyzerSyncError,
  runCallyzerSyncChunkForStaff,
} from "@/lib/callyzer-sync";
import { getCallyzerStaffSyncStatus } from "@/lib/callyzer-staff-status";
import { parseCallyzerSyncRequest } from "@/lib/parse-callyzer-sync-request";
import { USE_MOCK } from "@/lib/mock-data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const data = await getCallyzerStaffSyncStatus(id);
  return NextResponse.json({ data, error: null });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;

  if (USE_MOCK) {
    return NextResponse.json({
      data: { synced: 0, inserted: 0, skipped: 0, message: "Mock mode — skipped" },
      error: null,
    });
  }

  const { chunkSize, cursor } = await parseCallyzerSyncRequest(request);

  try {
    const result = await runCallyzerSyncChunkForStaff(id, {
      extendedTimeout: true,
      chunkSize,
      cursor,
    });
    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    const message = formatCallyzerSyncError(error, { extendedDb: true });
    console.error("[admin/users/callyzer-sync]", message, error);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
