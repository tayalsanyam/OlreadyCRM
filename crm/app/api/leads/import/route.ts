import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/auth";
import { createLead } from "@/lib/leads";
import type { Lead } from "@/lib/types";

const VALID_STATUSES = ["UNTOUCHED", "CONTACTED", "FOLLOW UP/DETAILS SHARED", "CONFIRMED", "PARTLY_PAID", "PAID", "DENIED"];

const DEFAULT_MAPPING: Record<string, number> = {
  name: 0,
  city: 1,
  company: 2,
  email: 3,
  phone: 4,
  insta_id: 5,
  bdm: 6,
  plan: 7,
  status: 8,
  remarks: 9,
  connected_on: 10,
  next_follow_up: 11,
  committed_date: 12,
  original_price: 13,
  discount: 14,
  amount_paid: 15,
  payment_status: 16,
  payment_mode: 17,
};

function getVal(arr: unknown[], idx: number): string | undefined {
  const v = arr[idx];
  if (v === undefined || v === null) return undefined;
  return String(v).trim() || undefined;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireAdmin(session)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    const body = await request.json();
    const rows = body.rows as unknown[][];
    const mapping = (body.mapping as Record<string, number>) ?? DEFAULT_MAPPING;
    if (!Array.isArray(rows) || rows.length === 0)
      return NextResponse.json({ error: "rows array required" }, { status: 400 });

    const created: string[] = [];
    const skipped: string[] = [];
    for (const row of rows) {
      const arr = Array.isArray(row) ? row : [];
      const firstVal = getVal(arr, mapping.name ?? 0);
      const secondVal = getVal(arr, mapping.city ?? 1);
      if (firstVal === "id" || firstVal === "name") continue; // skip header row
      if (!firstVal && !secondVal) continue; // skip empty
      const statusVal = getVal(arr, mapping.status ?? 8);
      const status = statusVal && VALID_STATUSES.includes(statusVal) ? statusVal : "UNTOUCHED";
      const phoneVal = getVal(arr, mapping.phone ?? 4);
      const lead: Omit<Lead, "id" | "created_at" | "last_modified"> = {
        name: firstVal ?? "",
        city: secondVal ?? "",
        company: getVal(arr, mapping.company ?? 2),
        email: getVal(arr, mapping.email ?? 3),
        phone: phoneVal != null ? phoneVal.replace(/\.0$/, "") : undefined,
        insta_id: getVal(arr, mapping.insta_id ?? 5),
        bdm: getVal(arr, mapping.bdm ?? 6) ?? "",
        plan: getVal(arr, mapping.plan ?? 7) ?? "",
        status,
        source: "import",
        remarks: getVal(arr, mapping.remarks ?? 9),
        connected_on: getVal(arr, mapping.connected_on ?? 10)?.slice(0, 10),
        next_follow_up: getVal(arr, mapping.next_follow_up ?? 11)?.slice(0, 10),
        committed_date: getVal(arr, mapping.committed_date ?? 12)?.slice(0, 10),
        original_price: (() => { const v = getVal(arr, mapping.original_price ?? 13); return v ? Number(v) : undefined; })(),
        discount: (() => { const v = getVal(arr, mapping.discount ?? 14); return v ? Number(v) : undefined; })(),
        amount_paid: (() => { const v = getVal(arr, mapping.amount_paid ?? 15); return v ? Number(v) : undefined; })(),
        payment_status: getVal(arr, mapping.payment_status ?? 16),
        payment_mode: getVal(arr, mapping.payment_mode ?? 17),
      };
      try {
        const l = await createLead(lead);
        if (l.name) created.push(l.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("Phone already exists")) skipped.push(lead.name || "Unknown");
        else throw e;
      }
    }
    return NextResponse.json({ imported: created.length, ids: created, skipped: skipped.length, skippedNames: skipped });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
