import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { polishWhatsAppMessage } from "@/lib/whatsapp/polish-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "regionalRm",
  "commissionRm",
  "leadUploader",
  "salesRm",
  "salesTl",
  "salesActivation",
  "careAgent",
  "admin",
  "owner",
]);

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }
  if (!ALLOWED.has(auth.session.role)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    draft?: string;
    audience?: "mua" | "bride";
    muaName?: string;
    brideName?: string;
  };
  const draft = body.draft?.trim();
  if (!draft) {
    return NextResponse.json({ data: null, error: "draft is required" }, { status: 400 });
  }

  const polished = await polishWhatsAppMessage({
    draft,
    audience: body.audience,
    muaName: body.muaName,
    brideName: body.brideName,
  });

  return NextResponse.json({ data: { polished }, error: null });
}
