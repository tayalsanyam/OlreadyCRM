import { requireRoles } from "@/lib/api-auth";
import { sql } from "@/db/index";
import { rowsToCsv } from "@/lib/csv";
import { USE_MOCK } from "@/lib/mock-data";
import { parseAdminMuaListFilters } from "@/lib/admin-muas-query";
import {
  ADMIN_MUA_EXPORT_HEADERS,
  adminMuaListItemToExportRow,
  fetchAdminMuaListForExport,
} from "@/lib/admin-mua-export";

function csvDownload(csv: string, filename: string): Response {
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return new Response(auth.error, { status: auth.status });
  }

  const filters = parseAdminMuaListFilters(new URL(request.url).searchParams);

  if (USE_MOCK) {
    const csv = rowsToCsv([...ADMIN_MUA_EXPORT_HEADERS], [
      ["MUA-0001", "Demo MUA", "Delhi", "Inbound", "active", "Potential", "", "", "Potential", "Untouched", "Unassigned", 3, 1, "", 0, 0, 0],
    ]);
    return csvDownload(csv, "olready-muas-export.csv");
  }

  try {
    const items = await fetchAdminMuaListForExport(sql, filters);
    const rows = items.map((m) => adminMuaListItemToExportRow(m));
    const date = new Date().toISOString().slice(0, 10);
    return csvDownload(
      rowsToCsv([...ADMIN_MUA_EXPORT_HEADERS], rows),
      `olready-muas-export-${date}.csv`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed";
    return new Response(msg, { status: 500 });
  }
}
