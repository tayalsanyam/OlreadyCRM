const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Calendar start of today in India (IST), as a UTC instant. */
export function startOfTodayIst(now = new Date()): Date {
  const istMs = now.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  const y = istDate.getUTCFullYear();
  const m = istDate.getUTCMonth();
  const d = istDate.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - IST_OFFSET_MS);
}

/** Default pull window start: since last sync, but not before start of today IST. */
export function callyzerSyncFrom(lastSyncedAt: Date | null, now = new Date()): Date {
  const startToday = startOfTodayIst(now);
  if (!lastSyncedAt) return startToday;
  return lastSyncedAt > startToday ? lastSyncedAt : startToday;
}
