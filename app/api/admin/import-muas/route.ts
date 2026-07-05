import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { importMuaRows } from "@/lib/import-mua-batch";
import type { ImportMuaRowPayload, MuaImportProfile } from "@/lib/mua-import";

export type { ImportMuaRowPayload as ImportMuaPayload } from "@/lib/mua-import";

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    rows?: ImportMuaRowPayload[];
    profile?: MuaImportProfile;
    chunkMeta?: { startIndex?: number; totalRows?: number };
  };
  if (!body.rows?.length) {
    return NextResponse.json({ data: null, error: "rows required" }, { status: 400 });
  }

  const chunkStart = body.chunkMeta?.startIndex ?? 0;
  const totalRows = body.chunkMeta?.totalRows ?? body.rows.length;
  const processedRows = chunkStart + body.rows.length;
  const done = processedRows >= totalRows;

  if (USE_MOCK) {
    const result = mockStore.importValidatedMuas(
      body.rows.map((r) => ({
        name: r.name,
        city: r.city,
        regions: r.regions,
        phone: r.phone,
        email: r.email,
        planTier: r.planTier,
        planExpiry: r.planExpiry,
      })),
    );
    return NextResponse.json({
      data: { ...result, processedRows, totalRows, done },
      error: null,
    });
  }

  const result = await withTransaction(async (tx) =>
    importMuaRows(tx, body.rows!, auth.session.userId, { profile: body.profile }),
  );

  return NextResponse.json({
    data: {
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
      duplicates: result.duplicates,
      processedRows,
      totalRows,
      done,
    },
    error: null,
  });
}
