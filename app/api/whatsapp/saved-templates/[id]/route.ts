import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { WhatsAppConfig } from "@/lib/whatsapp/config";
import { loadWhatsAppConfigFromDb } from "@/lib/whatsapp/load-config";
import {
  listSavedTemplates,
  removeSavedTemplate,
  updateSavedTemplate,
} from "@/lib/whatsapp/saved-templates";
import { WHATSAPP_TEMPLATE_POOLS, type WhatsAppTemplatePool } from "@/lib/whatsapp/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function persistConfig(config: WhatsAppConfig): Promise<void> {
  if (USE_MOCK) {
    mockStore.updateWhatsAppConfig(config);
    return;
  }
  await sql`
    UPDATE sla_config SET whatsapp_config = ${sql.json(config)}, updated_at = NOW()
    WHERE id = 1
  `;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    label?: string;
    body?: string;
    pool?: WhatsAppTemplatePool;
  };

  const current = await loadWhatsAppConfigFromDb();
  const existing = listSavedTemplates(current).find((t) => t.id === id);
  if (!existing) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  const isAdmin = auth.session.role === "admin" || auth.session.role === "owner";
  if (!isAdmin && existing.createdBy !== auth.session.userId) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const label = body.label?.trim();
  const text = body.body?.trim();
  if (label != null && label.length < 2) {
    return NextResponse.json({ data: null, error: "Invalid label" }, { status: 400 });
  }
  if (text != null && text.length < 10) {
    return NextResponse.json({ data: null, error: "Message too short" }, { status: 400 });
  }
  if (body.pool != null && !WHATSAPP_TEMPLATE_POOLS.includes(body.pool)) {
    return NextResponse.json({ data: null, error: "Invalid pool" }, { status: 400 });
  }

  const merged = updateSavedTemplate(current, id, {
    ...(label != null ? { label } : {}),
    ...(text != null ? { body: text } : {}),
    ...(body.pool != null ? { pool: body.pool } : {}),
    updatedBy: auth.session.userId,
    updatedByName: auth.session.name ?? "Staff",
  });
  if (!merged) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }
  await persistConfig(merged);

  const updated = listSavedTemplates(merged).find((t) => t.id === id);
  return NextResponse.json({ data: updated, error: null });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const current = await loadWhatsAppConfigFromDb();
  const existing = listSavedTemplates(current).find((t) => t.id === id);
  if (!existing) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  const isAdmin = auth.session.role === "admin" || auth.session.role === "owner";
  if (!isAdmin && existing.createdBy !== auth.session.userId) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  await persistConfig(removeSavedTemplate(current, id));
  return NextResponse.json({ data: { ok: true }, error: null });
}
