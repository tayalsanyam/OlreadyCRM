import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import {
  buildInboxCategoryFilterOptions,
  fetchAllCategoryConfig,
  fetchTicketCategoriesForSide,
} from "@/lib/ticket-category-registry";

export async function GET(request: Request) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const raisedByType = searchParams.get("raisedByType");
  const forFilters = searchParams.get("forFilters") === "true";

  const data = await withTransaction(async (tx) => {
    if (forFilters) {
      const rows = await fetchAllCategoryConfig(tx, true);
      const mua = await fetchTicketCategoriesForSide(tx, "mua");
      const bride = await fetchTicketCategoriesForSide(tx, "bride");
      return {
        filterOptions: buildInboxCategoryFilterOptions(rows),
        muaCategories: mua,
        brideCategories: bride,
        labelMap: Object.fromEntries(rows.map((r) => [r.category, r.label])),
      };
    }
    if (raisedByType) {
      const categories = await fetchTicketCategoriesForSide(tx, raisedByType);
      return { categories };
    }
    const rows = await fetchAllCategoryConfig(tx, true);
    return {
      categories: rows.map((r) => ({
        value: r.category,
        label: r.label,
        description: r.description,
        defaultUrgency: r.defaultUrgency,
      })),
      filterOptions: buildInboxCategoryFilterOptions(rows),
    };
  });

  return NextResponse.json({ data, error: null });
}
