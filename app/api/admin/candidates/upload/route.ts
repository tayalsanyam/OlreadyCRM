import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { importMuaRows } from "@/lib/import-mua-batch";
import {
  MUA_TEMPLATE_HEADERS,
  normalizePhone,
  templateSampleRow,
  type ImportMuaRowPayload,
  type MuaImportProfile,
} from "@/lib/mua-import";
import { resolveMuaRegions } from "@/lib/mua-region";
import { normalizeMuaSource } from "@/lib/mua-source";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }
    if (!inQuotes && c === ",") {
      row.push(field.trim());
      field = "";
      i++;
      continue;
    }
    if (!inQuotes && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some((x) => x.length > 0)) rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  row.push(field.trim());
  if (row.some((x) => x.length > 0)) rows.push(row);
  return rows;
}

function colIndex(header: string[], ...names: string[]): number {
  for (const name of names) {
    const idx = header.indexOf(name.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Legacy GET template — redirects to unified template (prospect profile). */
export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const profile =
    (new URL(request.url).searchParams.get("profile") as MuaImportProfile | null) ??
    "prospect";
  const safeProfile = ["prospect", "roster", "plan_customer"].includes(profile)
    ? profile
    : "prospect";

  const template = [
    MUA_TEMPLATE_HEADERS.join(","),
    templateSampleRow(safeProfile).join(","),
  ].join("\n");

  return new NextResponse(template, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="mua-upload-${safeProfile}.csv"`,
    },
  });
}

/** Legacy POST — maps simple candidate CSV to unified import (prospect profile). */
export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ data: null, error: "CSV file is required" }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return NextResponse.json({ data: null, error: "CSV has no data rows" }, { status: 400 });
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {
    name: colIndex(header, "name"),
    phone: colIndex(header, "phone"),
    city: colIndex(header, "city"),
    source: colIndex(header, "source"),
    instagram: colIndex(header, "instagram"),
    whatsapp: colIndex(header, "whatsapp"),
    bio: colIndex(header, "bio", "about"),
  };
  if (idx.name < 0 || idx.phone < 0 || idx.city < 0) {
    return NextResponse.json(
      { data: null, error: "Required headers: Name, Phone, City" },
      { status: 400 },
    );
  }

  const payloadRows: ImportMuaRowPayload[] = [];

  for (let r = 1; r < rows.length; r++) {
    const line = rows[r];
    const name = (line[idx.name] ?? "").trim();
    const phone = normalizePhone(line[idx.phone] ?? "");
    const city = (line[idx.city] ?? "").trim();
    if (!name || phone.length !== 10 || !city) continue;

    const regions = resolveMuaRegions([], city);
    if (!regions.length) continue;

    payloadRows.push({
      name,
      city,
      phone,
      regions,
      email: null,
      source: normalizeMuaSource(idx.source >= 0 ? (line[idx.source] ?? "").trim() : null),
      instagram: idx.instagram >= 0 ? (line[idx.instagram] ?? "").trim() || null : null,
      whatsapp:
        idx.whatsapp >= 0 && line[idx.whatsapp]
          ? normalizePhone(line[idx.whatsapp] ?? "")
          : null,
      bio: idx.bio >= 0 ? (line[idx.bio] ?? "").trim() || null : null,
      planTier: null,
      planExpiry: null,
      leadCap: null,
      leadBudget: null,
      planStates: [],
      planRegions: [],
      planCities: [],
    });
  }

  const result = await withTransaction(async (tx) =>
    importMuaRows(tx, payloadRows, auth.session.userId),
  );

  return NextResponse.json({
    data: {
      inserted: result.imported,
      duplicates: result.duplicates,
      errors: result.errors.map((reason, i) => ({ row: i + 1, reason })),
    },
    error: null,
  });
}
