import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { WhatsAppConfig } from "@/lib/whatsapp/config";
import { loadWhatsAppConfigFromDb } from "@/lib/whatsapp/load-config";
import {
  appendSavedTemplate,
  listSavedTemplates,
  newSavedTemplateId,
  type SavedWhatsAppTemplate,
} from "@/lib/whatsapp/saved-templates";
import { WHATSAPP_TEMPLATE_POOLS, type WhatsAppTemplatePool } from "@/lib/whatsapp/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAVE_ROLES = new Set([
  "regionalRm",
  "commissionRm",
  "salesRm",
  "salesTl",
  "salesActivation",
  "careAgent",
  "feedbackRm",
  "admin",
  "owner",
]);

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

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const config = await loadWhatsAppConfigFromDb();
  return NextResponse.json({ data: listSavedTemplates(config), error: null });
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }
  if (!SAVE_ROLES.has(auth.session.role)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    label?: string;
    body?: string;
    pool?: WhatsAppTemplatePool;
  };
  const label = body.label?.trim();
  const text = body.body?.trim();
  const pool = body.pool ?? "rmMua";

  if (!label || label.length < 2) {
    return NextResponse.json({ data: null, error: "label is required" }, { status: 400 });
  }
  if (!text || text.length < 10) {
    return NextResponse.json({ data: null, error: "Message must be at least 10 characters" }, { status: 400 });
  }
  if (!WHATSAPP_TEMPLATE_POOLS.includes(pool)) {
    return NextResponse.json({ data: null, error: "Invalid pool" }, { status: 400 });
  }

  const current = await loadWhatsAppConfigFromDb();
  const entry: SavedWhatsAppTemplate = {
    id: newSavedTemplateId(),
    label,
    pool,
    body: text,
    createdBy: auth.session.userId,
    createdByName: auth.session.name ?? "Staff",
    createdAt: new Date().toISOString(),
  };
  const merged = appendSavedTemplate(current, entry);
  await persistConfig(merged);

  return NextResponse.json({ data: entry, error: null });
}
