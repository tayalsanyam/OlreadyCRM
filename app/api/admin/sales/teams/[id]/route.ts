import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";

function uniqueIds(ids: string[] | undefined): string[] {
  if (!ids?.length) return [];
  return [...new Set(ids.filter(Boolean))];
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const [team] = await sql<
    {
      id: string;
      name: string;
      tlId: string;
      tlName: string | null;
      members: { id: string; name: string }[];
    }[]
  >`
    SELECT
      t.id,
      t.name,
      t.tl_id AS "tlId",
      tl.name AS "tlName",
      COALESCE(
        json_agg(
          json_build_object('id', s.id, 'name', s.name)
          ORDER BY s.name
        ) FILTER (WHERE s.id IS NOT NULL),
        '[]'::json
      ) AS members
    FROM sales.teams t
    LEFT JOIN staff tl ON tl.id = t.tl_id
    LEFT JOIN staff s ON s.team_id = t.id AND s.role = 'sales_rm'
    WHERE t.id = ${id}::uuid
    GROUP BY t.id, t.name, t.tl_id, tl.name
  `;

  if (!team) {
    return NextResponse.json({ data: null, error: "Team not found" }, { status: 404 });
  }

  return NextResponse.json({ data: team, error: null });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    tlId?: string;
    addMemberIds?: string[];
    removeMemberIds?: string[];
  };

  const addMemberIds = uniqueIds(body.addMemberIds);
  const removeMemberIds = uniqueIds(body.removeMemberIds);

  if (addMemberIds.length > 50 || removeMemberIds.length > 50) {
    return NextResponse.json({ data: null, error: "Too many members in one request" }, { status: 400 });
  }

  try {
    await withTransaction(async (tx) => {
      const [team] = await tx<{ tlId: string }[]>`
        SELECT tl_id AS "tlId" FROM sales.teams WHERE id = ${id}::uuid
      `;
      if (!team) throw Object.assign(new Error("Team not found"), { status: 404 });

      if (body.name?.trim()) {
        await tx`UPDATE sales.teams SET name = ${body.name.trim()} WHERE id = ${id}::uuid`;
      }
      if (body.tlId) {
        const [tl] = await tx<{ id: string }[]>`
          SELECT id FROM staff WHERE id = ${body.tlId}::uuid AND role = 'sales_tl' AND active = true
        `;
        if (!tl) throw Object.assign(new Error("Invalid TL user"), { status: 400 });

        const oldTlId = team.tlId;
        await tx`UPDATE sales.teams SET tl_id = ${body.tlId}::uuid WHERE id = ${id}::uuid`;
        if (oldTlId !== body.tlId) {
          await tx`
            UPDATE staff SET team_id = NULL, updated_at = NOW()
            WHERE id = ${oldTlId}::uuid AND role = 'sales_tl' AND team_id = ${id}::uuid
          `;
          await tx`
            UPDATE staff SET team_id = ${id}::uuid, updated_at = NOW()
            WHERE id = ${body.tlId}::uuid AND role = 'sales_tl'
          `;
        }
      }
      if (addMemberIds.length) {
        await tx`
          UPDATE staff SET team_id = ${id}::uuid, updated_at = NOW()
          WHERE id IN ${tx(addMemberIds.map((v) => tx`${v}::uuid`))}
            AND role = 'sales_rm'
            AND active = true
        `;
      }
      if (removeMemberIds.length) {
        await tx`
          UPDATE staff SET team_id = NULL, updated_at = NOW()
          WHERE id IN ${tx(removeMemberIds.map((v) => tx`${v}::uuid`))}
            AND role = 'sales_rm'
            AND team_id = ${id}::uuid
        `;
      }
    });

    return NextResponse.json({ data: { ok: true }, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
    await withTransaction(async (tx) => {
      const [active] = await tx<{ c: number }[]>`
        SELECT COUNT(*)::int AS c
        FROM sales.pipeline p
        JOIN muas m ON m.id = p.mua_id
        WHERE m.team_id = ${id}::uuid
          AND p.status = 'active'
      `;
      if ((active?.c ?? 0) > 0) {
        throw new Error("Team has active pipeline MUAs");
      }

      await tx`UPDATE staff SET team_id = NULL WHERE team_id = ${id}::uuid`;
      await tx`UPDATE muas SET team_id = NULL WHERE team_id = ${id}::uuid`;
      await tx`DELETE FROM sales.teams WHERE id = ${id}::uuid`;
    });

    return NextResponse.json({ data: { ok: true }, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ data: null, error: msg }, { status: 400 });
  }
}
