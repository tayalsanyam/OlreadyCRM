"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

import { fetcher } from "@/lib/fetcher";

export default function NewLeadPage() {
  const router = useRouter();
  const { data: dropdowns, isLoading } = useSWR("/api/config/dropdowns", fetcher);
  const [form, setForm] = useState({
    name: "", city: "", company: "", email: "", phone: "", insta_id: "",
    bdm: "", plan: "", remarks: "", connected_on: "", next_follow_up: "",
    original_price: "", discount: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          original_price: form.original_price ? Number(form.original_price) : undefined,
          discount: form.discount ? Number(form.discount) : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed");
        return;
      }
      const lead = await res.json();
      router.push(`/leads/${lead.id}`);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold text-white">New Lead</h1>
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-slate-400">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="input"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">City *</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              className="input"
              required
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-slate-400">Phone</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="input"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-slate-400">BDM *</label>
            <select
              value={form.bdm}
              onChange={(e) => setForm((f) => ({ ...f, bdm: e.target.value }))}
              className="input"
              required
            >
              <option value="">Select</option>
              {(dropdowns?.bdms ?? []).map((b: string) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Plan</label>
            <select
              value={form.plan}
              onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
              className="input"
            >
              <option value="">Select</option>
              {((dropdowns?.plans ?? []) as { name?: string; active?: boolean }[]).filter((p) => p.active !== false).map((p) => {
                const name = p?.name ?? "";
                return name ? <option key={name} value={name}>{name}</option> : null;
              })}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-400">Remarks</label>
          <textarea
            value={form.remarks}
            onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
            className="input min-h-[80px]"
            rows={3}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-slate-400">Connected On</label>
            <input
              type="date"
              value={form.connected_on}
              onChange={(e) => setForm((f) => ({ ...f, connected_on: e.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Next Follow Up</label>
            <input
              type="date"
              value={form.next_follow_up}
              onChange={(e) => setForm((f) => ({ ...f, next_follow_up: e.target.value }))}
              className="input"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-slate-400">Original Price (₹)</label>
            <input
              type="number"
              value={form.original_price}
              onChange={(e) => setForm((f) => ({ ...f, original_price: e.target.value }))}
              className="input"
              placeholder="e.g. 18000"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">Discount (₹)</label>
            <input
              type="number"
              value={form.discount}
              onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
              className="input"
              placeholder="0"
            />
          </div>
        </div>
        {error && <p className="text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={loading || isLoading}>
            {loading ? "Saving..." : isLoading ? "Loading..." : "Create Lead"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
