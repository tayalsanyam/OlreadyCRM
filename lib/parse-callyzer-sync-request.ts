import type { CallyzerSyncCursor } from "@/lib/callyzer-sync-types";
import { CALLYZER_CHUNK_SIZE } from "@/lib/callyzer-sync-types";

export type ParsedCallyzerSyncRequest = {
  chunkSize: number;
  extendedTimeout: boolean;
  cursor: CallyzerSyncCursor | null;
};

function parseCursor(raw: unknown): CallyzerSyncCursor | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (
    typeof c.fromTs !== "number" ||
    typeof c.toTs !== "number" ||
    typeof c.pageNo !== "number" ||
    typeof c.totalRecords !== "number" ||
    typeof c.insertedSoFar !== "number" ||
    typeof c.skippedSoFar !== "number" ||
    typeof c.unmappedSoFar !== "number"
  ) {
    return null;
  }
  return {
    fromTs: c.fromTs,
    toTs: c.toTs,
    pageNo: c.pageNo,
    totalRecords: c.totalRecords,
    insertedSoFar: c.insertedSoFar,
    skippedSoFar: c.skippedSoFar,
    unmappedSoFar: c.unmappedSoFar,
  };
}

export async function parseCallyzerSyncRequest(
  request: Request,
): Promise<ParsedCallyzerSyncRequest> {
  const { searchParams } = new URL(request.url);
  const chunkSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get("chunk") ?? CALLYZER_CHUNK_SIZE)),
  );
  const extendedTimeout =
    searchParams.get("extended") !== "0" &&
    searchParams.get("extended") !== "false" &&
    searchParams.get("fast") !== "1";

  let cursor: CallyzerSyncCursor | null = null;
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      const body = (await request.json()) as { cursor?: unknown };
      cursor = parseCursor(body?.cursor);
    } catch {
      cursor = null;
    }
  }

  return { chunkSize, extendedTimeout, cursor };
}
