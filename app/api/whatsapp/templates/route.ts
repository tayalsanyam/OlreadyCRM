import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { loadResolvedWhatsAppConfig } from "@/lib/whatsapp/load-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const config = await loadResolvedWhatsAppConfig();
  return NextResponse.json({ data: config, error: null });
}
