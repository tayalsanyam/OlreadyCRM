import type { SelfBookingFilter } from "@/lib/bookings-list";
import type { Region } from "@/lib/types";

const REGIONS = new Set<Region>(["north", "east", "west", "south"]);

function parseOptionalUuid(raw: string | null): string | null {
  if (
    !raw ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
  ) {
    return null;
  }
  return raw;
}

function parseOptionalIsoDate(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

export type BookingsAdminQuery = {
  page: number;
  pageSize: number;
  region: Region | null;
  regionalRmId: string | null;
  commissionRmId: string | null;
  selfBooking: SelfBookingFilter;
  fromDate: string | null;
  toDate: string | null;
  month: string | null;
  cancelled: boolean | null;
};

export function parseBookingsAdminQuery(searchParams: URLSearchParams): BookingsAdminQuery {
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    500,
    Math.max(1, Number(searchParams.get("pageSize") ?? "50") || 50),
  );

  const regionRaw = searchParams.get("region");
  const region =
    regionRaw && REGIONS.has(regionRaw as Region) ? (regionRaw as Region) : null;

  const regionalRmId =
    parseOptionalUuid(searchParams.get("regionalRmId")) ??
    parseOptionalUuid(searchParams.get("rmId"));

  const commissionRmId = parseOptionalUuid(searchParams.get("commissionRmId"));

  const selfRaw = searchParams.get("selfBooking");
  const selfBooking: SelfBookingFilter =
    selfRaw === "yes" || selfRaw === "no" ? selfRaw : "all";

  let fromDate = parseOptionalIsoDate(searchParams.get("fromDate"));
  let toDate = parseOptionalIsoDate(searchParams.get("toDate"));
  const month = searchParams.get("month")?.trim() || null;
  if (!fromDate && !toDate && month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(y!, m!, 0).getDate();
    fromDate = `${month}-01`;
    toDate = `${month}-${String(last).padStart(2, "0")}`;
  }

  const cancelledRaw = searchParams.get("cancelled");
  let cancelled: boolean | null = null;
  if (cancelledRaw === "true") cancelled = true;
  else if (cancelledRaw === "false") cancelled = false;

  return {
    page,
    pageSize,
    region,
    regionalRmId,
    commissionRmId,
    selfBooking,
    fromDate,
    toDate,
    month,
    cancelled,
  };
}
