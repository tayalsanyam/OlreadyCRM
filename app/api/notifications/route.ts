import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { apiErrorResponse } from "@/lib/api-error-response";
import { requireSession } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";

const MOCK_NOTIFS = [
  {
    id: "n1",
    message: "New lead assigned to you",
    link: "/rm/leads/ld-1",
    read: false,
    createdAt: new Date().toISOString(),
  },
];

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (USE_MOCK) {
    return NextResponse.json({ data: MOCK_NOTIFS, error: null });
  }

  try {
    const rows = await sql<
      { id: string; message: string; link: string | null; read: boolean; createdAt: string }[]
    >`
      SELECT id, message, link, read, created_at
      FROM notifications
      WHERE staff_id = ${auth.session.userId}::uuid
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return NextResponse.json({ data: rows, error: null });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load notifications");
  }
}

export async function PATCH(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (USE_MOCK) {
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  const body = (await request.json()) as { ids?: string[]; markAll?: boolean };

  try {
    if (body.markAll) {
      await sql`
        UPDATE notifications SET read = true
        WHERE staff_id = ${auth.session.userId}::uuid
      `;
    } else if (body.ids?.length) {
      for (const id of body.ids) {
        await sql`
          UPDATE notifications SET read = true
          WHERE id = ${id}::uuid AND staff_id = ${auth.session.userId}::uuid
        `;
      }
    }

    return NextResponse.json({ data: { ok: true }, error: null });
  } catch (error) {
    return apiErrorResponse(error, "Failed to update notifications");
  }
}

export async function DELETE(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (USE_MOCK) {
    return NextResponse.json({ data: { deleted: 0 }, error: null });
  }

  const body = (await request.json()) as { clearRead?: boolean };
  if (!body.clearRead) {
    return NextResponse.json(
      { data: null, error: "clearRead required" },
      { status: 400 }
    );
  }

  try {
    const deleted = await sql`
      DELETE FROM notifications
      WHERE staff_id = ${auth.session.userId}::uuid AND read = true
      RETURNING id
    `;

    return NextResponse.json({
      data: { deleted: deleted.length },
      error: null,
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to clear notifications");
  }
}
