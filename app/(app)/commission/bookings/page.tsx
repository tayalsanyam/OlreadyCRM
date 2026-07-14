"use client";

import { useEffect, useState } from "react";
import { BookingsTable } from "@/components/bookings/BookingsTable";
import type { BookingRow } from "@/lib/types";

type BookingsPage = {
  data: BookingRow[];
  total: number;
  page: number;
  pageSize: number;
};

export default function CommissionBookingsPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    void fetch("/api/bookings?pageSize=500")
      .then(async (r) => {
        const json = (await r.json()) as {
          data: BookingsPage | null;
          error?: string | null;
        };
        if (!r.ok || json.error) {
          setLoadError(json.error ?? `Could not load bookings (${r.status})`);
          setBookings([]);
        } else {
          setBookings(json.data?.data ?? []);
        }
        setLoading(false);
      })
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
          Bookings on commission and portal leads you work
        </p>
      </div>
      {loadError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </p>
      )}
      {loading ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
      ) : (
        <BookingsTable
          bookings={bookings}
          showCommission
          leadHref={(id) => `/rm/leads/${id}`}
          onRefresh={load}
        />
      )}
    </div>
  );
}
