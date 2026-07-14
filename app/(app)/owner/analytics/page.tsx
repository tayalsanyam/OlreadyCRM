"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { cn } from "@/lib/utils";

const COLORS = ["#1B2A4A", "#0D7377", "#64748B", "#C0392B"];

function formatRs(value: number) {
  return `Rs. ${value.toLocaleString("en-IN")}`;
}

function conversionClass(pct: number) {
  if (pct >= 30) return "font-semibold text-emerald-600";
  if (pct >= 15) return "font-semibold text-amber-600";
  return "font-semibold text-red-600";
}

function tierLabel(t: string) {
  if (t.startsWith("tier_")) return `Tier ${t.slice(5)}`;
  return t;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      {label && <p className="mb-1 font-medium text-brand">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" && p.name.toLowerCase().includes("rate")
            ? `${p.value}%`
            : formatRs(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function OwnerAnalyticsPage() {
  const [data, setData] = useState<{
    volumeByWeek: Array<Record<string, string | number>>;
    conversionByRegion: Array<{ region: string; rate: number }>;
    lossAttribution: Array<{ name: string; value: number }>;
    muaUtilisation: Array<{
      name: string;
      tier: string;
      pushes: number;
      cap: number;
    }>;
    bookingRevenueByMonth: Array<{
      month: string;
      revenue: number;
      bookings: number;
    }>;
    leadSourceBreakdown: Array<{
      source: string;
      total: number;
      booked: number;
      conversionPct: number;
    }>;
    tierFunnel: Array<{
      budgetTier: string;
      verified: number;
      assigned: number;
      booked: number;
    }>;
    rmLeaderboard: Array<{
      rmName: string;
      region: string;
      conversionPct: number | null;
      totalBooked: number;
    }>;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/owner/analytics")
      .then(async (r) => {
        const json = (await r.json()) as { data: typeof data; error?: string | null };
        if (!r.ok || json.error) {
          setLoadError(json.error ?? "Could not load analytics");
          setData(null);
          return;
        }
        setLoadError(null);
        setData(json.data);
      })
      .catch(() => {
        setLoadError("Could not load analytics");
        setData(null);
      });
  }, []);

  const kpis = useMemo(() => {
    if (!data) return null;
    const leadsMonth = data.volumeByWeek.reduce(
      (sum, w) =>
        sum +
        Number(w.tier1 ?? 0) +
        Number(w.tier2 ?? 0) +
        Number(w.tier3 ?? 0),
      0
    );
    const rates = data.conversionByRegion.map((r) => r.rate);
    const avgConversion =
      rates.length > 0
        ? rates.reduce((a, b) => a + b, 0) / rates.length
        : 0;
    const bookingValue = data.muaUtilisation.reduce(
      (sum, m) => sum + m.pushes * 45000,
      0
    );
    const months = data.bookingRevenueByMonth ?? [];
    const revenueThisMonth =
      months.length > 0 ? months[months.length - 1].revenue : 0;
    return { leadsMonth, avgConversion, bookingValue, revenueThisMonth };
  }, [data]);

  const tierFunnelChart = useMemo(() => {
    if (!data?.tierFunnel) return [];
    return data.tierFunnel.map((t) => ({
      tier: tierLabel(t.budgetTier),
      verified: t.verified,
      assigned: t.assigned,
      booked: t.booked,
    }));
  }, [data]);

  if (loadError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-brand">Analytics</h1>
        <p className="text-sm text-red-600">{loadError}</p>
      </div>
    );
  }

  if (!data || !kpis) {
    return <div className="h-96 animate-pulse rounded-xl bg-slate-200" />;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-brand">Analytics</h1>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm shadow-sm">
          <span className="font-bold text-brand">{kpis.leadsMonth}</span>
          <span className="text-slate-muted"> leads this month</span>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm shadow-sm">
          <span className="font-bold text-brand">{kpis.avgConversion.toFixed(1)}%</span>
          <span className="text-slate-muted"> conversion</span>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm shadow-sm">
          <span className="font-bold text-brand">{formatRs(kpis.bookingValue)}</span>
          <span className="text-slate-muted"> bookings value</span>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm shadow-sm">
          <span className="font-bold text-brand">
            {formatRs(kpis.revenueThisMonth)}
          </span>
          <span className="text-slate-muted"> booking revenue this month</span>
        </div>
      </div>

      <Card>
        <h2 className="mb-1 text-lg font-semibold text-brand">
          Lead volume by week
        </h2>
        <p className="mb-4 text-xs text-slate-muted">Last 8 weeks by budget tier</p>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data.volumeByWeek}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<ChartTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="tier1"
              name="Tier 1"
              stroke={COLORS[0]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="tier2"
              name="Tier 2"
              stroke={COLORS[1]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="tier3"
              name="Tier 3"
              stroke={COLORS[2]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-brand">
            Conversion by region
          </h2>
          <p className="mb-4 text-xs text-slate-muted">Assigned → booked rate (%)</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.conversionByRegion}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="region" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit="%" />
              <Tooltip
                formatter={(value: number) => [`${value}%`, "Conversion"]}
              />
              <Bar dataKey="rate" name="Conversion %" fill="#0D7377" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-brand">
            Loss attribution
          </h2>
          <p className="mb-4 text-xs text-slate-muted">Where leads were lost</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data.lossAttribution}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={88}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
              >
                {data.lossAttribution.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatRs(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-brand">
          Plan MUA utilisation
        </h2>
        <Table>
          <THead>
            <TR>
              <TH>MUA</TH>
              <TH>Tier</TH>
              <TH>Pushes</TH>
              <TH>Cap</TH>
              <TH>%</TH>
            </TR>
          </THead>
          <TBody>
            {data.muaUtilisation.map((m) => {
              const pct = Math.round((m.pushes / m.cap) * 100);
              return (
                <TR key={m.name}>
                  <TD>{m.name}</TD>
                  <TD>{m.tier}</TD>
                  <TD>{m.pushes}</TD>
                  <TD>{m.cap}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded bg-slate-100">
                        <div
                          className="h-2 rounded bg-accent"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs">{pct}%</span>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-brand">
              Monthly booking revenue
            </h2>
            <p className="text-xs text-slate-muted">Last 6 months</p>
          </div>
          <Link
            href="/admin/bookings"
            className="text-sm font-medium text-accent hover:underline"
          >
            View all bookings →
          </Link>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.bookingRevenueByMonth ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(v: number) =>
                `₹${(v / 100000).toFixed(1)}L`
              }
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === "revenue") return [formatRs(value), "Revenue"];
                return [value, "Bookings"];
              }}
            />
            <Bar dataKey="revenue" name="Revenue" fill="#1B2A4A" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="bookings"
                position="top"
                formatter={(v: number) => `${v} bookings`}
                className="fill-slate-600 text-[10px]"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-brand">
            Lead source performance
          </h2>
          <Table>
            <THead>
              <TR>
                <TH>Source</TH>
                <TH>Total</TH>
                <TH>Booked</TH>
                <TH>Conversion %</TH>
              </TR>
            </THead>
            <TBody>
              {(data.leadSourceBreakdown ?? []).map((row) => (
                <TR key={row.source}>
                  <TD>{row.source}</TD>
                  <TD>{row.total}</TD>
                  <TD>{row.booked}</TD>
                  <TD className={conversionClass(row.conversionPct)}>
                    {row.conversionPct}%
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-semibold text-brand">Tier funnel</h2>
          <p className="mb-4 text-xs text-slate-muted">
            Verified → assigned → booked by tier
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={tierFunnelChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="tier" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="verified" name="Verified" fill="#1B2A4A" />
              <Bar dataKey="assigned" name="Assigned" fill="#0D7377" />
              <Bar dataKey="booked" name="Booked" fill="#16a34a" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-brand">RM leaderboard</h2>
        <ol className="space-y-2">
          {(data.rmLeaderboard ?? []).map((rm, i) => (
            <li key={rm.rmName}>
              <Link
                href={`/admin/reports?rm=${encodeURIComponent(rm.rmName)}`}
                className="flex items-center gap-3 rounded-lg border border-slate-100 px-4 py-3 transition-colors hover:bg-light-bg"
              >
                <span className="w-6 text-center text-lg">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-brand">{rm.rmName}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] capitalize text-slate-muted">
                    {rm.region}
                  </span>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold text-brand">{rm.totalBooked} booked</p>
                  <p className={cn("text-xs", conversionClass(rm.conversionPct ?? 0))}>
                    {rm.conversionPct ?? 0}% conversion
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
