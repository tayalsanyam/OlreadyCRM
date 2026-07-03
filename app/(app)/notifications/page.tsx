"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface NotificationRow {
  id: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

function dateGroupLabel(iso: string): string {
  const d = iso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (d === today) return "Today";
  if (d === yesterday) return "Yesterday";
  return "Earlier";
}

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);

  function load() {
    void fetch("/api/notifications")
      .then((r) => r.json())
      .then((json: { data: NotificationRow[] }) => setItems(json.data ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const order = ["Today", "Yesterday", "Earlier"];
    const map = new Map<string, NotificationRow[]>();
    for (const n of items) {
      const label = dateGroupLabel(n.createdAt);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(n);
    }
    return order
      .filter((k) => map.has(k))
      .map((k) => [k, map.get(k)!] as const);
  }, [items]);

  const hasUnread = items.some((n) => !n.read);

  async function markIds(ids: string[]) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setItems((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))
    );
  }

  async function dismiss(id: string) {
    await markIds([id]);
    setItems((prev) => prev.filter((n) => n.id !== id));
  }

  async function openNotification(n: NotificationRow) {
    if (!n.read) await markIds([n.id]);
    if (n.link) router.push(n.link);
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function clearAllRead() {
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearRead: true }),
    });
    setItems((prev) => prev.filter((n) => !n.read));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-brand">Notifications</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => void markAllRead()}>
            Mark all read
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void clearAllRead()}>
            Clear all read
          </Button>
        </div>
      </div>

      {!hasUnread && items.length > 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Check className="h-10 w-10 text-accent" strokeWidth={1.5} />
          <p className="text-sm font-medium text-brand">You&apos;re all caught up</p>
        </div>
      )}

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <Check className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
          <p className="text-sm text-slate-muted">No notifications</p>
        </Card>
      ) : (
        <Card className="divide-y divide-slate-100 p-0">
          {grouped.map(([label, entries]) => (
            <div key={label}>
              <p className="sticky top-0 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-muted">
                {label}
              </p>
              <ul>
                {entries.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      "flex items-stretch border-b border-slate-50 last:border-0",
                      !n.read && "border-l-2 border-l-accent bg-accent/5"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void openNotification(n)}
                      className={cn(
                        "min-w-0 flex-1 px-4 py-3 text-left text-sm hover:bg-light-bg",
                        !n.read && "font-medium"
                      )}
                    >
                      <p>{n.message}</p>
                      <p className="mt-1 text-xs text-slate-muted">
                        {new Date(n.createdAt).toLocaleString("en-IN")}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void dismiss(n.id)}
                      className="px-3 text-slate-muted hover:bg-light-bg hover:text-brand"
                      aria-label="Dismiss"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
