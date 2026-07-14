import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import {
  listActiveMuasAdmin,
  listActiveMuasForSalesRm,
  listActiveMuasForSalesTl,
} from "@/lib/sales-active-muas";

export async function GET() {
  const auth = await requireRoles(["salesRm", "salesTl", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rows = await withTransaction(async (tx) => {
    if (auth.session.role === "salesRm") {
      return listActiveMuasForSalesRm(tx, auth.session.userId);
    }
    if (auth.session.role === "salesTl") {
      return listActiveMuasForSalesTl(tx, auth.session.userId);
    }
    return listActiveMuasAdmin(tx);
  });

  return NextResponse.json({ data: rows, error: null });
}
