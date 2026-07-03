"use client";

import { useEffect, useState } from "react";
import { BookingsTable } from "@/components/bookings/BookingsTable";
import { bookingShowsCommission } from "@/lib/commission-booking";
import type { BookingRow } from "@/lib/types";
import type { PaginatedResult } from "@/db/index";

export default function RmBookingsPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    void fetch("/api/bookings?pageSize=500")
      .then((r) => r.json())
      .then(
        (json: {
          data: PaginatedResult<BookingRow> | null;
          error?: string | null;
        }) => {
          if (json.error) {
            setLoadError(json.error);
            setBookings([]);
          } else {
            setBookings(json.data?.data ?? []);
          }
          setLoading(false);
        }
      )
      .catch(() => {
        setLoadError("Could not load bookings");
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">My Bookings</h1>
        <p className="text-sm text-slate-muted">
          Confirmed bookings on your assigned leads. Use{" "}
          <strong className="font-medium text-brand">Record payment</strong> on a
          row to enter advance, balance, and payment mode.
        </p>
      </div>
      {loadError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
          {loadError.includes("payment_mode") && (
            <> — run <code className="text-xs">npm run db:migrate</code> on the server.</>
          )}
        </p>
      )}
      {loading ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
      ) : (
        <BookingsTable
          bookings={bookings.filter((b) => !b.cancelled)}
          showCommission={bookings.some(bookingShowsCommission)}
          onRefresh={load}
        />
      )}
    </div>
  );
}
