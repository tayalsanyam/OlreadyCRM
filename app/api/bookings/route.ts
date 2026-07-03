import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";
import { parseBookingsAdminQuery } from "@/lib/bookings-admin-query";
import { ensureCommissionCollectionTasks } from "@/lib/commission-collection-tasks";
import { fetchBookingsList } from "@/lib/bookings-list";
import type { BudgetTier } from "@/lib/types";
import { USE_MOCK } from "@/lib/mock-data";
import type { UserRole } from "@/lib/types";

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const q = parseBookingsAdminQuery(new URL(request.url).searchParams);
  const tier = new URL(request.url).searchParams.get("tier") as BudgetTier | null;

  const { session } = auth;
  const role = session.role as UserRole;

  if (USE_MOCK) {
    return NextResponse.json({
      data: { data: [], total: 0, page: q.page, pageSize: q.pageSize, totalPages: 1 },
      error: null,
    });
  }

  try {
    await withTransaction((tx) =>
      ensureCommissionCollectionTasks(tx, {
        role: session.role,
        userId: session.userId,
      })
    );

    const { rows, total } = await fetchBookingsList({
      role,
      userId: session.userId,
      region: q.region,
      tier: tier || null,
      regionalRmId: q.regionalRmId,
      commissionRmId: q.commissionRmId,
      selfBooking: q.selfBooking,
      fromDate: q.fromDate,
      toDate: q.toDate,
      cancelled: q.cancelled,
      page: q.page,
      pageSize: q.pageSize,
    });

    const totalPages = Math.ceil(total / q.pageSize) || 1;

    return NextResponse.json({
      data: { data: rows, total, page: q.page, pageSize: q.pageSize, totalPages },
      error: null,
    });
  } catch (e) {
    return apiErrorResponse(e, "Failed to load bookings");
  }
}
