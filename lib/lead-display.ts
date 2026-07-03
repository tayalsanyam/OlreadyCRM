/** Shared lead formatting for queue, tasks, and cards. */

export function formatEventDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function daysToEventClass(days: number | null | undefined): string {
  if (days == null) return "text-slate-muted";
  if (days <= 30) return "font-bold text-red-600";
  if (days <= 45) return "font-semibold text-amber-600";
  return "text-sm text-text";
}
