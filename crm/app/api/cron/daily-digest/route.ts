import { NextRequest, NextResponse } from "next/server";
import { sendDigests } from "@/lib/digest";

/**
 * Daily digest: Role-based emails (BDM=their tasks, TL=team, Admin=all by BDM).
 * Fallback: DAILY_DIGEST_EMAILS gets admin-style digest if no users have email.
 *
 * Not scheduled on Vercel by default — call manually or wire a second cron / external
 * scheduler when you want this as a product feature. Use CRON_SECRET for auth.
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
