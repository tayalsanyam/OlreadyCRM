import { NextRequest, NextResponse } from "next/server";
import { sendDigests } from "@/lib/digest";

/**
 * Daily digest only (no Sheets sync). Production normally sends digest from
 * `/api/cron/sync` after the daily backup. Use this route for manual runs or testing.
 * Use CRON_SECRET for auth.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || request.headers.get("x-cron-secret");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}` && auth !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sent, errors } = await sendDigests();
  if (errors.length) {
    return NextResponse.json({ sent, errors }, { status: errors.length === sent ? 200 : 500 });
  }
  return NextResponse.json({ sent, ok: true });
}
