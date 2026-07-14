import type { CallyzerChunkResult, CallyzerSyncCursor } from "@/lib/callyzer-sync-types";
import {
  CALLYZER_CHUNK_PAUSE_MS,
  CALLYZER_CHUNK_SIZE,
  CALLYZER_SKIP_IF_SYNCED_WITHIN_MIN,
} from "@/lib/callyzer-sync-types";
import { apiErrorMessage } from "@/lib/api-json";

export type CallyzerChunkProgress = {
  processedRecords: number;
  totalRecords: number;
  insertedTotal: number;
};

export type CallyzerChainedSyncResult = {
  synced: number;
  inserted: number;
  skipped: number;
  unmapped: number;
  message?: string;
  /** True when pull was skipped because a recent watermark exists. */
  skippedAsFresh?: boolean;
  /** False when sync ended but watermark was not advanced (partial pull). */
  syncComplete?: boolean;
};

export type CallyzerSyncStatus = {
  callyzerNumber: string | null;
  lastSyncedAt: string | null;
  valid: boolean;
  message?: string;
};

export type SyncCallyzerCallsOptions = {
  syncUrl?: string;
  extended?: boolean;
  chunkSize?: number;
  onProgress?: (progress: CallyzerChunkProgress) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Any browser-tab Callyzer pull in progress (login sync or day-end). */
let callyzerSyncInFlight: Promise<CallyzerChainedSyncResult> | null = null;

export function isCallyzerSyncInFlight(): boolean {
  return callyzerSyncInFlight !== null;
}

/** Wait for a background login sync before day-end checks freshness. */
export async function waitForCallyzerSyncInFlight(): Promise<void> {
  if (!callyzerSyncInFlight) return;
  try {
    await callyzerSyncInFlight;
  } catch {
    /* day-end should still run its own sync */
  }
}

export function minutesSinceCallyzerSync(lastSyncedAt: string | null): number | null {
  if (!lastSyncedAt) return null;
  const ms = Date.now() - new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 60_000;
}

export function isCallyzerRecentlySynced(
  lastSyncedAt: string | null,
  withinMinutes = CALLYZER_SKIP_IF_SYNCED_WITHIN_MIN,
): boolean {
  const mins = minutesSinceCallyzerSync(lastSyncedAt);
  return mins !== null && mins < withinMinutes;
}

export async function fetchCallyzerSyncStatus(
  syncUrl = "/api/me/callyzer-sync",
): Promise<CallyzerSyncStatus | null> {
  try {
    const res = await fetch(syncUrl, { cache: "no-store" });
    const json = (await res.json()) as { data: CallyzerSyncStatus | null };
    return json.data;
  } catch {
    return null;
  }
}

/** Client-chained Callyzer pull — one API page per HTTP request until `done: true`. */
export async function syncCallyzerCalls(
  options: SyncCallyzerCallsOptions = {},
): Promise<CallyzerChainedSyncResult> {
  const run = async (): Promise<CallyzerChainedSyncResult> => {
  const syncUrl = options.syncUrl ?? "/api/me/callyzer-sync";
  const chunkSize = options.chunkSize ?? CALLYZER_CHUNK_SIZE;
  let cursor: CallyzerSyncCursor | null = null;
  let inserted = 0;
  let synced = 0;
  let skipped = 0;
  let unmapped = 0;
  let message: string | undefined;

  while (true) {
    const params = new URLSearchParams();
    params.set("chunk", String(chunkSize));
    if (options.extended === true) params.set("extended", "1");
    else if (options.extended === false) params.set("extended", "0");

    const res = await fetch(`${syncUrl}?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cursor ? { cursor } : {}),
    });

    const json = (await res.json()) as { data: CallyzerChunkResult | null; error?: string | null };
    if (!res.ok || !json.data) {
      throw new Error(await apiErrorMessage(res, json.error ?? "Callyzer sync failed"));
    }

    const chunk = json.data;
    inserted += chunk.inserted;
    synced += chunk.synced;
    skipped += chunk.skipped;
    unmapped += chunk.unmapped;
    if (chunk.message) message = chunk.message;

    options.onProgress?.({
      processedRecords: chunk.processedRecords,
      totalRecords: chunk.totalRecords,
      insertedTotal: inserted,
    });

    if (chunk.done) {
      if (chunk.syncComplete === false) {
        throw new Error(
          chunk.message ??
            `Callyzer sync incomplete — processed ${inserted + skipped} of ${chunk.totalRecords} calls.`,
        );
      }
      return { synced, inserted, skipped, unmapped, message, syncComplete: true };
    }

    if (!chunk.cursor) {
      throw new Error("Callyzer sync incomplete — missing cursor");
    }
    cursor = chunk.cursor;
    await sleep(CALLYZER_CHUNK_PAUSE_MS);
  }
  };

  const promise = run();
  callyzerSyncInFlight = promise;
  try {
    return await promise;
  } finally {
    if (callyzerSyncInFlight === promise) {
      callyzerSyncInFlight = null;
    }
  }
}

/** Skip pull when Callyzer was synced recently (saves API + server time at day-end). */
export async function syncCallyzerCallsUnlessFresh(
  options: SyncCallyzerCallsOptions & {
    freshWithinMinutes?: number;
    force?: boolean;
  } = {},
): Promise<CallyzerChainedSyncResult> {
  const syncUrl = options.syncUrl ?? "/api/me/callyzer-sync";
  const withinMin = options.freshWithinMinutes ?? CALLYZER_SKIP_IF_SYNCED_WITHIN_MIN;

  if (!options.force) {
    await waitForCallyzerSyncInFlight();
    const status = await fetchCallyzerSyncStatus(syncUrl);
    if (status?.valid && isCallyzerRecentlySynced(status.lastSyncedAt, withinMin)) {
      const mins = minutesSinceCallyzerSync(status.lastSyncedAt);
      const ago =
        mins !== null && mins < 1
          ? "just now"
          : mins !== null
            ? `${Math.round(mins)} min ago`
            : "recently";
      return {
        synced: 0,
        inserted: 0,
        skipped: 0,
        unmapped: 0,
        skippedAsFresh: true,
        message: `Callyzer up to date (synced ${ago})`,
      };
    }
  }

  return syncCallyzerCalls(options);
}
