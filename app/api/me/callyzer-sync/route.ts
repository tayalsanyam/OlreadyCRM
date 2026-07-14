import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  formatCallyzerSyncError,
  runCallyzerSyncChunkForStaff,
} from "@/lib/callyzer-sync";
import { getCallyzerStaffSyncStatus } from "@/lib/callyzer-staff-status";
import { parseCallyzerSyncRequest } from "@/lib/parse-callyzer-sync-request";
import { USE_MOCK } from "@/lib/mock-data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const data = await getCallyzerStaffSyncStatus(auth.session.userId);
  return NextResponse.json({ data, error: null });
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (USE_MOCK) {
    return NextResponse.json({
      data: { synced: 0, inserted: 0, skipped: 0, message: "Mock mode — skipped" },
      error: null,
    });
  }

  const { chunkSize, extendedTimeout, cursor } = await parseCallyzerSyncRequest(request);

  try {
    const result = await runCallyzerSyncChunkForStaff(auth.session.userId, {
      extendedTimeout,
      chunkSize,
      cursor,
    });
    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    const message = formatCallyzerSyncError(error, { extendedDb: extendedTimeout });
    console.error("[me/callyzer-sync]", message, error);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
