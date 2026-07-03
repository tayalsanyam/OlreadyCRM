import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { listMuaServiceCatalog } from "@/lib/mua-service-catalog";

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rows = await listMuaServiceCatalog(sql, { activeOnly: false });
  return NextResponse.json({ data: rows, error: null });
}

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    baseAmount?: number | null;
    sortOrder?: number;
  };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ data: null, error: "Service name is required" }, { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO mua_service_catalog (name, base_amount, sort_order)
    VALUES (
      ${name},
      ${body.baseAmount ?? null},
      ${body.sortOrder ?? 0}
    )
    ON CONFLICT (name) DO UPDATE SET
      base_amount = COALESCE(EXCLUDED.base_amount, mua_service_catalog.base_amount),
      sort_order = COALESCE(EXCLUDED.sort_order, mua_service_catalog.sort_order),
      active = true
    RETURNING id, name, base_amount AS "baseAmount", sort_order AS "sortOrder", active
  `;

  return NextResponse.json({ data: row, error: null });
}

export async function PATCH(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    baseAmount?: number | null;
    sortOrder?: number;
    active?: boolean;
  };
  if (!body.id) {
    return NextResponse.json({ data: null, error: "id is required" }, { status: 400 });
  }

  const [row] = await sql`
    UPDATE mua_service_catalog SET
      name = COALESCE(${body.name?.trim() || null}, name),
      base_amount = ${body.baseAmount === undefined ? sql`base_amount` : body.baseAmount},
      sort_order = COALESCE(${body.sortOrder ?? null}, sort_order),
      active = COALESCE(${body.active ?? null}, active)
    WHERE id = ${body.id}::uuid
    RETURNING id, name, base_amount AS "baseAmount", sort_order AS "sortOrder", active
  `;

  if (!row) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data: row, error: null });
}

export async function DELETE(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ data: null, error: "id is required" }, { status: 400 });
  }

  const [row] = await sql<{ id: string; name: string }[]>`
    DELETE FROM mua_service_catalog
    WHERE id = ${id}::uuid
    RETURNING id, name
  `;

  if (!row) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: row, error: null });
}
