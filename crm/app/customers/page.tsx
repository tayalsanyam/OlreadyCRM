"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { fetcher } from "@/lib/fetcher";

type CustomerRow = {
  id: string;
  lead_id: string;
  name: string;
  city: string;
  phone?: string;
  email?: string;
  ops_coordinator?: string;
  plan_name?: string;
  plan_start_date?: string;
  plan_end_date?: string;
  price_paid?: number;
};

export default function CustomersPage() {
  const [opsCoordinator, setOpsCoordinator] = useState("");
  const [city, setCity] = useState("");
  const [expiringSoon, setExpiringSoon] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("expiring_soon") === "true") {
      setExpiringSoon(true);
    }
  }, []);

  const params = new URLSearchParams();
  if (opsCoordinator) params.set("ops_coordinator", opsCoordinator);
  if (city) params.set("city", city);
  if (expiringSoon) params.set("expiring_soon", "true");

  const url = `/api/customers${params.toString() ? `?${params}` : ""}`;
  const { data: customers = [], error } = useSWR(url, fetcher, { refreshInterval: 10000 });
  const { data: dropdowns } = useSWR("/api/config/dropdowns", fetcher);

  const opsCoordinators = dropdowns?.ops_coordinators ?? [];

  if (error) return <div className="text-red-400">Failed to load</div>;

  const contact = (r: CustomerRow) => r.phone || r.email || "-";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Customers on Plan</h1>
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Ops Coordinator</label>
            <select
              value={opsCoordinator}
              onChange={(e) => setOpsCoordinator(e.target.value)}
              className="input text-sm py-1.5 w-40"
            >
              <option value="">All</option>
              {opsCoordinators.map((o: string) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="input text-sm py-1.5 w-36"
              placeholder="Filter by city"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={expiringSoon}
              onChange={(e) => setExpiringSoon(e.target.checked)}
              className="rounded"
            />
            Expiring soon (30 days)
          </label>
        </div>
      </div>
      <p className="text-slate-400 text-sm">
        Leads who have completed payment and have an active subscription.
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-600 text-left text-sm text-slate-400">
              <th className="p-2">Name</th>
              <th className="p-2">City</th>
              <th className="p-2">Contact</th>
              <th className="p-2">Plan</th>
              <th className="p-2">Plan Start</th>
              <th className="p-2">Amount</th>
              <th className="p-2">Expiry</th>
              <th className="p-2">Ops Coordinator</th>
            </tr>
          </thead>
          <tbody>
            {(customers as CustomerRow[]).map((row) => (
              <tr key={row.id} className="border-b border-slate-700/50">
                <td className="p-2">
                  <Link href={`/leads/${row.lead_id}`} className="text-sky-400 hover:underline">
                    {row.name}
                  </Link>
                </td>
                <td className="p-2 text-slate-300">{row.city}</td>
                <td className="p-2 text-slate-300">{contact(row)}</td>
                <td className="p-2 text-slate-300">{row.plan_name || "-"}</td>
                <td className="p-2 text-slate-400">{row.plan_start_date || "-"}</td>
                <td className="p-2">₹{(row.price_paid ?? 0).toLocaleString()}</td>
                <td className="p-2 text-amber-400">{row.plan_end_date || "-"}</td>
                <td className="p-2 text-slate-400">{row.ops_coordinator || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(customers as CustomerRow[]).length === 0 && (
          <div className="p-8 text-center text-slate-500">No customers found</div>
        )}
      </div>
    </div>
  );
}
