import { requireRoles } from "@/lib/api-auth";
import { parseBookingsAdminQuery } from "@/lib/bookings-admin-query";
import {
  BOOKING_CSV_HEADERS,
  bookingRowsToCsv,
  fetchBookingsList,
} from "@/lib/bookings-list";
import { csvResponse } from "@/lib/report-utils";
import { USE_MOCK } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return new Response(auth.error, { status: auth.status });
  }

  const q = parseBookingsAdminQuery(new URL(request.url).searchParams);

  if (USE_MOCK) {
    return csvResponse("olready-bookings", [...BOOKING_CSV_HEADERS], []);
  }

  const { rows } = await fetchBookingsList({
    role: auth.session.role,
    userId: auth.session.userId,
    region: q.region,
    regionalRmId: q.regionalRmId,
    commissionRmId: q.commissionRmId,
    selfBooking: q.selfBooking,
    fromDate: q.fromDate,
    toDate: q.toDate,
    cancelled: q.cancelled,
  });

  return csvResponse(
    "olready-bookings",
    [...BOOKING_CSV_HEADERS],
    bookingRowsToCsv(rows)
  );
}
