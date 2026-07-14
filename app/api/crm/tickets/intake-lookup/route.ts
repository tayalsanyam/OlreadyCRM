import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceTicketCreateAccess } from "@/lib/api-auth";
import {
  lookupLeadForIntake,
  lookupMuaForIntake,
  lookupPendingByContact,
} from "@/lib/ticket-intake-lookup";
import { fetchTicketCategoriesForSide } from "@/lib/ticket-category-registry";

export async function GET(request: Request) {
  const auth = await requireGrievanceTicketCreateAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name") ?? undefined;
  const phone = searchParams.get("phone") ?? undefined;
  const email = searchParams.get("email") ?? undefined;
  const muaId = searchParams.get("muaId") ?? undefined;
  const leadId = searchParams.get("leadId") ?? undefined;
  const raisedByType = searchParams.get("raisedByType") ?? "mua";

  const data = await withTransaction(async (tx) => {
    if (raisedByType === "bride") {
      const leadMatches = await lookupLeadForIntake(tx, { name, phone, email, leadId });
      let orphanPending: Awaited<ReturnType<typeof lookupPendingByContact>> = [];
      if (!leadMatches.length) {
        orphanPending = await lookupPendingByContact(tx, { phone, email });
      }
      const categories = await fetchTicketCategoriesForSide(tx, "bride");
      return {
        leadMatches,
        orphanPending,
        categories,
      };
    }

    const rows = await lookupMuaForIntake(tx, { name, phone, email, muaId });
    let orphanPending: Awaited<ReturnType<typeof lookupPendingByContact>> = [];
    if (!rows.length) {
      orphanPending = await lookupPendingByContact(tx, { phone, email });
    }
    const categories = await fetchTicketCategoriesForSide(tx, "mua");
    return {
      matches: rows,
      orphanPending,
      categories,
    };
  });

  return NextResponse.json({ data, error: null });
}
