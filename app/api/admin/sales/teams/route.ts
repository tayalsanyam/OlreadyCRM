import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";

function uniqueMemberIds(ids: string[] | undefined, tlId: string): string[] {
  if (!ids?.length) return [];
  return [...new Set(ids.filter((id) => id && id !== tlId))];
}

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rows = await sql`
    SELECT
      t.id,
      t.name,
      t.tl_id AS "tlId",
      tl.name AS "tlName",
      COUNT(s.id) FILTER (WHERE s.role = 'sales_rm')::int AS "memberCount",
      COALESCE(
        json_agg(
          json_build_object('id', s.id, 'name', s.name)
          ORDER BY s.name
        ) FILTER (WHERE s.id IS NOT NULL AND s.role = 'sales_rm'),
        '[]'::json
      ) AS members
    FROM sales.teams t
    LEFT JOIN staff tl ON tl.id = t.tl_id
    LEFT JOIN staff s ON s.team_id = t.id AND s.role = 'sales_rm'
    GROUP BY t.id, t.name, t.tl_id, tl.name, t.created_at
    ORDER BY t.created_at DESC
  `;

  return NextResponse.json({ data: rows, error: null });
}

export async function POST(request: Request) {
  const auth = await requireRoles(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    tlId?: string;
    memberIds?: string[];
  };
  const name = body.name?.trim();
  const tlId = body.tlId;
  const memberIds = uniqueMemberIds(body.memberIds, tlId ?? "");

  if (!name || !tlId) {
    return NextResponse.json({ data: null, error: "name and tlId are required" }, { status: 400 });
  }

  if (memberIds.length > 100) {
    return NextResponse.json({ data: null, error: "Too many members in one request" }, { status: 400 });
  }

  try {
    const team = await withTransaction(async (tx) => {
      const [tl] = await tx<{ id: string }[]>`
        SELECT id FROM staff WHERE id = ${tlId}::uuid AND role = 'sales_tl' AND active = true
      `;
      if (!tl) {
        throw Object.assign(new Error("Invalid TL user"), { status: 400 });
      }

      const [row] = await tx`
        INSERT INTO sales.teams (name, tl_id)
        VALUES (${name}, ${tlId}::uuid)
        RETURNING id, name, tl_id AS "tlId", created_at AS "createdAt"
      `;

      await tx`
        UPDATE staff SET team_id = ${row.id}::uuid, updated_at = NOW()
        WHERE id = ${tlId}::uuid AND role = 'sales_tl'
      `;

      if (memberIds.length) {
        await tx`
          UPDATE staff SET team_id = ${row.id}::uuid, updated_at = NOW()
          WHERE id IN ${tx(memberIds.map((id) => tx`${id}::uuid`))}
            AND role = 'sales_rm'
            AND active = true
        `;
      }

      return row;
    });

    return NextResponse.json({ data: team, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;
    const message = error instanceof Error ? error.message : "Create failed";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
