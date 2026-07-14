import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { canAccessMuaByRole, muaInRegion } from "@/lib/mua-access";
import {
  deleteLocalPortfolioFile,
  MAX_MUA_PORTFOLIO_ITEMS,
  saveMuaPortfolioFile,
} from "@/lib/mua-portfolio-upload";
import type { Region, SessionUser } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

function canEditPortfolio(role: string): boolean {
  return role === "admin" || role === "owner" || role === "regionalRm";
}

async function authorize(muaId: string, session: SessionUser) {
  const [mua] = await sql<{ ok: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM muas WHERE id = ${muaId}::uuid) AS ok
  `;
  if (!mua?.ok) return { status: 404 as const, error: "MUA not found" };

  const regionOk = session.region
    ? await muaInRegion(muaId, session.region as Region)
    : true;
  if (!canAccessMuaByRole(session, regionOk)) {
    return { status: 403 as const, error: "Forbidden" };
  }
  return { status: 200 as const, error: null };
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }
  if (!canEditPortfolio(auth.session.role)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const { id: muaId } = await params;
  const gate = await authorize(muaId, auth.session);
  if (gate.status !== 200) {
    return NextResponse.json({ data: null, error: gate.error }, { status: gate.status });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let title = "";
  let description: string | null = null;
  let mediaUrl = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    title = String(form.get("title") ?? "").trim();
    description = String(form.get("description") ?? "").trim() || null;
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ data: null, error: "Image file is required" }, { status: 400 });
    }
    try {
      const saved = await saveMuaPortfolioFile(muaId, file);
      mediaUrl = saved.publicPath;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      return NextResponse.json({ data: null, error: message }, { status: 400 });
    }
  } else {
    const body = (await request.json()) as {
      title?: string;
      description?: string | null;
      mediaUrl?: string;
    };
    title = body.title?.trim() ?? "";
    description = body.description?.trim() || null;
    mediaUrl = body.mediaUrl?.trim() ?? "";
  }

  if (!title || !mediaUrl) {
    return NextResponse.json(
      { data: null, error: "Title and image are required" },
      { status: 400 }
    );
  }

  const [countRow] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM mua_portfolio_items WHERE mua_id = ${muaId}::uuid
  `;
  if ((countRow?.count ?? 0) >= MAX_MUA_PORTFOLIO_ITEMS) {
    return NextResponse.json(
      { data: null, error: `Maximum ${MAX_MUA_PORTFOLIO_ITEMS} portfolio items per MUA` },
      { status: 400 }
    );
  }

  const [row] = await sql<
    {
      id: string;
      title: string;
      description: string | null;
      mediaUrl: string;
      sortOrder: number;
      createdAt: string;
    }[]
  >`
    INSERT INTO mua_portfolio_items (
      mua_id, title, description, media_url, created_by
    ) VALUES (
      ${muaId}::uuid,
      ${title},
      ${description},
      ${mediaUrl},
      ${auth.session.userId}::uuid
    )
    RETURNING
      id,
      title,
      description,
      media_url AS "mediaUrl",
      sort_order AS "sortOrder",
      created_at AS "createdAt"
  `;

  return NextResponse.json({ data: row, error: null });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }
  if (!canEditPortfolio(auth.session.role)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const { id: muaId } = await params;
  const gate = await authorize(muaId, auth.session);
  if (gate.status !== 200) {
    return NextResponse.json({ data: null, error: gate.error }, { status: gate.status });
  }

  const itemId = new URL(request.url).searchParams.get("itemId");
  if (!itemId) {
    return NextResponse.json({ data: null, error: "itemId required" }, { status: 400 });
  }

  const [row] = await sql<{ mediaUrl: string }[]>`
    SELECT media_url AS "mediaUrl"
    FROM mua_portfolio_items
    WHERE id = ${itemId}::uuid AND mua_id = ${muaId}::uuid
  `;
  if (!row) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  await sql`
    DELETE FROM mua_portfolio_items
    WHERE id = ${itemId}::uuid AND mua_id = ${muaId}::uuid
  `;

  await deleteLocalPortfolioFile(row.mediaUrl);

  return NextResponse.json({ data: { ok: true }, error: null });
}
