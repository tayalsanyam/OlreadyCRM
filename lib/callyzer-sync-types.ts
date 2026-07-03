/** Callyzer API page size per HTTP chunk — keep low for Vercel Hobby 60s limit. */
export const CALLYZER_CHUNK_SIZE = 10;

/** Day-end skips pull when watermark is newer than this (minutes). */
export const CALLYZER_SKIP_IF_SYNCED_WITHIN_MIN = 15;

/** Random delay before login sync (ms) to spread org-wide API load. */
export const CALLYZER_LOGIN_STAGGER_MS_MAX = 45_000;

/** Pause between chained chunk requests from the same browser. */
export const CALLYZER_CHUNK_PAUSE_MS = 500;

export type CallyzerSyncCursor = {
  fromTs: number;
  toTs: number;
  pageNo: number;
  /** Callyzer total_records for this pull session (from first page). */
  totalRecords: number;
  insertedSoFar: number;
  skippedSoFar: number;
  unmappedSoFar: number;
};

export type CallyzerSyncResult = {
  synced: number;
  inserted: number;
  skipped: number;
  unmapped: number;
  mappedStaff: number;
  lookbackDays?: number;
  fromTs: number;
  toTs: number;
  fromIso: string;
  toIso: string;
  empPhone?: string;
  message?: string;
};

export type CallyzerChunkResult = CallyzerSyncResult & {
  done: boolean;
  /** False when pagination finished but not all Callyzer rows were accounted for. */
  syncComplete: boolean;
  cursor: CallyzerSyncCursor | null;
  totalRecords: number;
  processedRecords: number;
};

export type CallyzerSyncOptions = {
  extendedTimeout?: boolean;
  cursor?: CallyzerSyncCursor | null;
  chunkSize?: number;
};
