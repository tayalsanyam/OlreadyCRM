import { sql, withLongTransaction, withTransaction, type TransactionSql } from "@/db/index";
import { isDbStatementTimeout } from "@/lib/db-connection-error";
import { loadCallyzerIdentityByStaffId } from "@/lib/callyzer-identity";
import { callyzerSyncFrom } from "@/lib/callyzer-ist";
import { ingestCallyzerCall, type CallyzerCallInput } from "@/lib/callyzer-ingest";
import {
  getCallyzerLastSyncedAt,
  normalizeEmpPhone,
  setCallyzerLastSyncedAt,
} from "@/lib/callyzer-sync-state";
import { normalizePhone } from "@/lib/phone";
import {
  CALLYZER_CHUNK_SIZE,
  type CallyzerChunkResult,
  type CallyzerSyncCursor,
  type CallyzerSyncOptions,
  type CallyzerSyncResult,
} from "@/lib/callyzer-sync-types";

export {
  CALLYZER_CHUNK_SIZE,
  type CallyzerChunkResult,
  type CallyzerSyncCursor,
  type CallyzerSyncOptions,
  type CallyzerSyncResult,
} from "@/lib/callyzer-sync-types";

type CallyzerCallLog = {
  id?: string;
  emp_number?: string;
  client_number?: string;
  duration?: number;
  call_type?: string;
  call_date?: string;
  call_time?: string;
  note?: string;
  call_recording_url?: string;
  synced_at?: string;
};

type CallyzerResponse = {
  result?: CallyzerCallLog[];
  total_records?: number;
};

const CALLYZER_API_TIMEOUT_SEC = 60;
/** Callyzer allows one request per second — stay slightly above to avoid 429s. */
const CALLYZER_API_MIN_INTERVAL_MS = 1100;
const CALLYZER_429_MAX_RETRIES = 5;
const DB_STATEMENT_TIMEOUT_SEC = 45;
const DB_LONG_STATEMENT_TIMEOUT_SEC = 300;
/** Max calls ingested per DB transaction (keeps each batch under statement_timeout). */
const INGEST_BATCH_SIZE = 25;

function parseCallDirection(raw?: string): "inbound" | "outbound" | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === "incoming" || v === "inbound") return "inbound";
  if (v === "outgoing" || v === "outbound") return "outbound";
  return null;
}

/** Map Callyzer history row → ingest input (matches rm.call_logs + mirrors). */
function parseCallTime(log: CallyzerCallLog): string | null {
  if (log.synced_at) {
    const dt = new Date(log.synced_at.replace(" IST", "+05:30"));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  if (log.call_date && log.call_time) {
    const dt = new Date(`${log.call_date}T${log.call_time}+05:30`);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  if (log.call_date) {
    const dt = new Date(`${log.call_date}T00:00:00+05:30`);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  return null;
}

function toCallInput(row: CallyzerCallLog, source: CallyzerCallInput["source"]): CallyzerCallInput | null {
  if (!row.id || !row.emp_number || !row.client_number) return null;
  return {
    callId: row.id,
    empNumber: row.emp_number,
    clientPhone: row.client_number,
    direction: parseCallDirection(row.call_type),
    durationSec: Math.max(0, Number(row.duration ?? 0)),
    calledAt: parseCallTime(row),
    outcome: row.note?.trim() || null,
    recordingUrl: row.call_recording_url || null,
    source,
  };
}

let callyzerApiLastAt = 0;
/** Serialize syncs that share a Callyzer line (login + day-end often fire together). */
const phoneSyncQueues = new Map<string, Promise<unknown>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleCallyzerApi(): Promise<void> {
  const wait = callyzerApiLastAt + CALLYZER_API_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  callyzerApiLastAt = Date.now();
}

async function withPhoneSyncLock<T>(phoneKey: string, fn: () => Promise<T>): Promise<T> {
  const prev = phoneSyncQueues.get(phoneKey) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  phoneSyncQueues.set(
    phoneKey,
    next.catch(() => {
      /* keep queue chain alive */
    }),
  );
  try {
    return await next;
  } finally {
    if (phoneSyncQueues.get(phoneKey) === next) {
      phoneSyncQueues.delete(phoneKey);
    }
  }
}

async function fetchCallyzerPage(args: {
  token: string;
  fromTs: number;
  toTs: number;
  empNumbers: string[];
  pageNo: number;
  pageSize: number;
}): Promise<CallyzerResponse> {
  const base = process.env.CALLYZER_API_BASE_URL ?? "https://api1.callyzer.co/api/v2.1";
  const url = `${base.replace(/\/$/, "")}/call-log/history`;

  for (let attempt = 0; attempt <= CALLYZER_429_MAX_RETRIES; attempt++) {
    await throttleCallyzerApi();

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${args.token}`,
        },
        body: JSON.stringify({
          synced_from: args.fromTs,
          synced_to: args.toTs,
          call_types: ["Incoming", "Outgoing"],
          emp_numbers: args.empNumbers,
          is_exclude_numbers: false,
          page_no: args.pageNo,
          page_size: args.pageSize,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(CALLYZER_API_TIMEOUT_SEC * 1000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Callyzer API timed out (${CALLYZER_API_TIMEOUT_SEC}s)`);
      }
      throw error;
    }

    if (res.status === 429) {
      if (attempt >= CALLYZER_429_MAX_RETRIES) {
        const text = await res.text();
        throw new Error(`Callyzer API 429: ${text.slice(0, 400)}`);
      }
      await sleep(CALLYZER_API_MIN_INTERVAL_MS);
      callyzerApiLastAt = Date.now();
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Callyzer API ${res.status}: ${text.slice(0, 400)}`);
    }

    return (await res.json()) as CallyzerResponse;
  }

  throw new Error("Callyzer API request failed");
}

async function ingestCallBatch(
  batch: CallyzerCallInput[],
  extendedTimeout: boolean,
): Promise<{ inserted: number; skipped: number; unmapped: number }> {
  let inserted = 0;
  let skipped = 0;
  let unmapped = 0;

  const runIngest = async (tx: TransactionSql) => {
    for (const input of batch) {
      const result = await ingestCallyzerCall(tx, input);
      if (result === "inserted") inserted += 1;
      else if (result === "unmapped") unmapped += 1;
      else skipped += 1;
    }
  };

  if (extendedTimeout) {
    await withLongTransaction(runIngest);
  } else {
    await withTransaction(runIngest);
  }

  return { inserted, skipped, unmapped };
}

async function ingestPage(
  rows: CallyzerCallLog[],
  seenCallIds: Set<string>,
  extendedTimeout = false,
  staffId?: string,
): Promise<{ fetched: number; inserted: number; skipped: number; unmapped: number }> {
  const inputs: CallyzerCallInput[] = [];
  let skipped = 0;

  for (const row of rows) {
    const input = toCallInput(row, "callyzer");
    if (!input || seenCallIds.has(input.callId)) {
      skipped += 1;
      continue;
    }
    seenCallIds.add(input.callId);
    inputs.push(staffId ? { ...input, staffId } : input);
  }

  if (inputs.length === 0) {
    return { fetched: 0, inserted: 0, skipped, unmapped: 0 };
  }

  let inserted = 0;
  let unmapped = 0;

  for (let i = 0; i < inputs.length; i += INGEST_BATCH_SIZE) {
    const batch = inputs.slice(i, i + INGEST_BATCH_SIZE);
    const batchStats = await ingestCallBatch(batch, extendedTimeout);
    inserted += batchStats.inserted;
    skipped += batchStats.skipped;
    unmapped += batchStats.unmapped;
  }

  return { fetched: inputs.length, inserted, skipped, unmapped };
}

async function pullCallyzerRange(args: {
  empNumbers: string[];
  fromTs: number;
  toTs: number;
  pageSize?: number;
  extendedTimeout?: boolean;
  staffId?: string;
}): Promise<Pick<CallyzerSyncResult, "synced" | "inserted" | "skipped" | "unmapped">> {
  const token = process.env.CALLYZER_API_TOKEN;
  if (!token) throw new Error("Missing CALLYZER_API_TOKEN");

  const pageSize = Math.min(100, Math.max(1, Number(args.pageSize ?? 100)));
  const empNumbers = [...new Set(args.empNumbers.map((n) => normalizePhone(n)).filter((n) => n.length >= 10))];
  if (empNumbers.length === 0) {
    return { synced: 0, inserted: 0, skipped: 0, unmapped: 0 };
  }

  let pageNo = 1;
  let synced = 0;
  let inserted = 0;
  let skipped = 0;
  let unmapped = 0;
  const seenCallIds = new Set<string>();

  while (true) {
    const payload = await fetchCallyzerPage({
      token,
      fromTs: args.fromTs,
      toTs: args.toTs,
      empNumbers,
      pageNo,
      pageSize,
    });
    const rows = payload.result ?? [];
    const pageStats = await ingestPage(rows, seenCallIds, args.extendedTimeout, args.staffId);
    synced += pageStats.fetched;
    inserted += pageStats.inserted;
    skipped += pageStats.skipped;
    unmapped += pageStats.unmapped;

    const totalRecords = Number(payload.total_records ?? rows.length);
    if (rows.length === 0 || pageNo * pageSize >= totalRecords) break;
    pageNo += 1;
  }

  return { synced, inserted, skipped, unmapped };
}

async function pullCallyzerChunk(args: {
  empNumbers: string[];
  fromTs: number;
  toTs: number;
  pageNo: number;
  pageSize: number;
  extendedTimeout?: boolean;
  staffId?: string;
}): Promise<
  Pick<CallyzerSyncResult, "synced" | "inserted" | "skipped" | "unmapped"> & {
    totalRecords: number;
    processedRecords: number;
    hasMore: boolean;
    nextPageNo: number;
  }
> {
  const token = process.env.CALLYZER_API_TOKEN;
  if (!token) throw new Error("Missing CALLYZER_API_TOKEN");

  const pageSize = Math.min(100, Math.max(1, Number(args.pageSize)));
  const empNumbers = [...new Set(args.empNumbers.map((n) => normalizePhone(n)).filter((n) => n.length >= 10))];
  if (empNumbers.length === 0) {
    return {
      synced: 0,
      inserted: 0,
      skipped: 0,
      unmapped: 0,
      totalRecords: 0,
      processedRecords: 0,
      hasMore: false,
      nextPageNo: args.pageNo,
    };
  }

  const payload = await fetchCallyzerPage({
    token,
    fromTs: args.fromTs,
    toTs: args.toTs,
    empNumbers,
    pageNo: args.pageNo,
    pageSize,
  });
  const rows = payload.result ?? [];
  const pageStats = await ingestPage(rows, new Set<string>(), args.extendedTimeout, args.staffId);
  const totalRecords = Number(payload.total_records ?? rows.length);
  const processedRecords = Math.min(totalRecords, (args.pageNo - 1) * pageSize + rows.length);
  const hasMore = rows.length > 0 && args.pageNo * pageSize < totalRecords;

  return {
    synced: pageStats.fetched,
    inserted: pageStats.inserted,
    skipped: pageStats.skipped,
    unmapped: pageStats.unmapped,
    totalRecords,
    processedRecords,
    hasMore,
    nextPageNo: args.pageNo + 1,
  };
}

function isValidCursor(cursor: CallyzerSyncCursor): boolean {
  return (
    Number.isFinite(cursor.fromTs) &&
    Number.isFinite(cursor.toTs) &&
    Number.isFinite(cursor.pageNo) &&
    cursor.pageNo >= 1 &&
    cursor.fromTs > 0 &&
    cursor.toTs > 0 &&
    cursor.fromTs <= cursor.toTs &&
    Number.isFinite(cursor.totalRecords) &&
    cursor.totalRecords >= 0 &&
    Number.isFinite(cursor.insertedSoFar) &&
    cursor.insertedSoFar >= 0 &&
    Number.isFinite(cursor.skippedSoFar) &&
    cursor.skippedSoFar >= 0 &&
    Number.isFinite(cursor.unmappedSoFar) &&
    cursor.unmappedSoFar >= 0
  );
}

/** All Callyzer rows accounted for before advancing the watermark. */
function sessionRecordsAccountedFor(
  insertedSoFar: number,
  skippedSoFar: number,
  totalRecords: number,
): boolean {
  if (totalRecords <= 0) return true;
  return insertedSoFar + skippedSoFar >= totalRecords;
}

function buildResult(
  partial: Pick<CallyzerSyncResult, "synced" | "inserted" | "skipped" | "unmapped"> & {
    fromTs: number;
    toTs: number;
    mappedStaff?: number;
    empPhone?: string;
    lookbackDays?: number;
    message?: string;
  },
): CallyzerSyncResult {
  return {
    ...partial,
    mappedStaff: partial.mappedStaff ?? 1,
    fromIso: new Date(partial.fromTs * 1000).toISOString(),
    toIso: new Date(partial.toTs * 1000).toISOString(),
  };
}

function buildChunkResult(
  partial: Pick<CallyzerSyncResult, "synced" | "inserted" | "skipped" | "unmapped"> & {
    fromTs: number;
    toTs: number;
    empPhone?: string;
    message?: string;
    done: boolean;
    syncComplete: boolean;
    cursor: CallyzerSyncCursor | null;
    totalRecords: number;
    processedRecords: number;
  },
): CallyzerChunkResult {
  return {
    ...buildResult({
      ...partial,
      mappedStaff: 1,
    }),
    done: partial.done,
    syncComplete: partial.syncComplete,
    cursor: partial.cursor,
    totalRecords: partial.totalRecords,
    processedRecords: partial.processedRecords,
  };
}

function staffUsesExtendedTimeout(options?: CallyzerSyncOptions): boolean {
  return options?.extendedTimeout !== false;
}

/** User-facing message for sync failures (API vs DB timeouts). */
export function formatCallyzerSyncError(
  error: unknown,
  options?: { extendedDb?: boolean },
): string {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.message.includes("Callyzer API timed out")) {
      return `Callyzer API timed out (${CALLYZER_API_TIMEOUT_SEC}s)`;
    }
    if (error.message.includes("Callyzer API 429")) {
      return "Callyzer rate limit — sync will retry on next refresh";
    }
  }

  if (isDbStatementTimeout(error)) {
    const useLong = options?.extendedDb !== false;
    const sec = useLong ? DB_LONG_STATEMENT_TIMEOUT_SEC : DB_STATEMENT_TIMEOUT_SEC;
    return `DB ingest timed out (${sec}s)`;
  }

  if (error instanceof Error && error.message) return error.message;
  return "Callyzer sync failed";
}

/**
 * Pull one Callyzer page for a staff member. Client chains until `done: true`.
 * Watermark advances only when every Callyzer row is accounted for (inserted + skipped).
 */
export async function runCallyzerSyncChunkForStaff(
  staffId: string,
  options?: CallyzerSyncOptions,
): Promise<CallyzerChunkResult> {
  const identity = await withTransaction((tx) => loadCallyzerIdentityByStaffId(tx, staffId));
  const empPhone = identity?.phone;
  const phoneKey = empPhone ? normalizeEmpPhone(empPhone) : null;

  if (!empPhone || !phoneKey) {
    const nowTs = Math.floor(Date.now() / 1000);
    return buildChunkResult({
      synced: 0,
      inserted: 0,
      skipped: 0,
      unmapped: 0,
      fromTs: nowTs,
      toTs: nowTs,
      done: true,
      syncComplete: true,
      cursor: null,
      totalRecords: 0,
      processedRecords: 0,
      message: "No Callyzer number on profile",
    });
  }

  return withPhoneSyncLock(phoneKey, () =>
    runCallyzerSyncChunkForStaffUnlocked(staffId, empPhone, phoneKey, options),
  );
}

async function runCallyzerSyncChunkForStaffUnlocked(
  staffId: string,
  empPhone: string,
  phoneKey: string,
  options?: CallyzerSyncOptions,
): Promise<CallyzerChunkResult> {
  const chunkSize = Math.min(
    100,
    Math.max(1, Number(options?.chunkSize ?? CALLYZER_CHUNK_SIZE)),
  );
  const extendedTimeout = staffUsesExtendedTimeout(options);
  const cursor = options?.cursor;

  let fromTs: number;
  let toTs: number;
  let pageNo: number;
  let sessionTotal: number;
  let insertedSoFar: number;
  let skippedSoFar: number;
  let unmappedSoFar: number;

  if (cursor && isValidCursor(cursor)) {
    fromTs = cursor.fromTs;
    toTs = cursor.toTs;
    pageNo = cursor.pageNo;
    sessionTotal = cursor.totalRecords;
    insertedSoFar = cursor.insertedSoFar;
    skippedSoFar = cursor.skippedSoFar;
    unmappedSoFar = cursor.unmappedSoFar;
  } else {
    const now = new Date();
    toTs = Math.floor(now.getTime() / 1000);
    const lastSynced = await getCallyzerLastSyncedAt(empPhone);
    fromTs = Math.floor(callyzerSyncFrom(lastSynced, now).getTime() / 1000);
    pageNo = 1;
    sessionTotal = 0;
    insertedSoFar = 0;
    skippedSoFar = 0;
    unmappedSoFar = 0;

    if (fromTs >= toTs) {
      return buildChunkResult({
        synced: 0,
        inserted: 0,
        skipped: 0,
        unmapped: 0,
        fromTs,
        toTs,
        empPhone: phoneKey,
        done: true,
        syncComplete: true,
        cursor: null,
        totalRecords: 0,
        processedRecords: 0,
        message: "Already up to date",
      });
    }
  }

  const chunk = await pullCallyzerChunk({
    empNumbers: [empPhone],
    fromTs,
    toTs,
    pageNo,
    pageSize: chunkSize,
    extendedTimeout,
    staffId,
  });

  if (sessionTotal <= 0) {
    sessionTotal = chunk.totalRecords;
  }
  insertedSoFar += chunk.inserted;
  skippedSoFar += chunk.skipped;
  unmappedSoFar += chunk.unmapped;

  const nextCursor: CallyzerSyncCursor = {
    fromTs,
    toTs,
    pageNo: chunk.nextPageNo,
    totalRecords: sessionTotal,
    insertedSoFar,
    skippedSoFar,
    unmappedSoFar,
  };

  if (!chunk.hasMore) {
    const accounted = sessionRecordsAccountedFor(insertedSoFar, skippedSoFar, sessionTotal);

    if (accounted) {
      const watermarkAt = new Date(toTs * 1000);
      const persistWatermark = async (tx: TransactionSql) => {
        await setCallyzerLastSyncedAt(tx, empPhone, watermarkAt);
      };

      if (extendedTimeout) {
        await withLongTransaction(persistWatermark);
      } else {
        await withTransaction(persistWatermark);
      }
    }

    const processed = insertedSoFar + skippedSoFar;
    return buildChunkResult({
      synced: chunk.synced,
      inserted: chunk.inserted,
      skipped: chunk.skipped,
      unmapped: chunk.unmapped,
      fromTs,
      toTs,
      empPhone: phoneKey,
      done: true,
      syncComplete: accounted,
      cursor: null,
      totalRecords: sessionTotal,
      processedRecords: chunk.processedRecords,
      message: accounted
        ? undefined
        : `Callyzer sync incomplete — processed ${processed} of ${sessionTotal} calls. Use Hard refresh to retry.`,
    });
  }

  return buildChunkResult({
    synced: chunk.synced,
    inserted: chunk.inserted,
    skipped: chunk.skipped,
    unmapped: chunk.unmapped,
    fromTs,
    toTs,
    empPhone: phoneKey,
    done: false,
    syncComplete: false,
    cursor: nextCursor,
    totalRecords: sessionTotal,
    processedRecords: chunk.processedRecords,
  });
}

/**
 * Login sync: pull calls for one staff Callyzer line since last watermark (or start of today IST).
 * Watermark is keyed by normalized phone so shared lines sync once.
 * @deprecated Prefer client-chained `runCallyzerSyncChunkForStaff` for HTTP routes.
 */
export async function runCallyzerSyncForStaff(
  staffId: string,
  options?: CallyzerSyncOptions,
): Promise<CallyzerSyncResult> {
  let cursor = options?.cursor ?? null;
  let aggregate: CallyzerSyncResult | null = null;

  while (true) {
    const chunk = await runCallyzerSyncChunkForStaff(staffId, { ...options, cursor });
    if (!aggregate) {
      aggregate = chunk;
    } else {
      aggregate = {
        ...chunk,
        synced: aggregate.synced + chunk.synced,
        inserted: aggregate.inserted + chunk.inserted,
        skipped: aggregate.skipped + chunk.skipped,
        unmapped: aggregate.unmapped + chunk.unmapped,
      };
    }

    if (chunk.done) {
      if (!chunk.syncComplete) {
        throw new Error(chunk.message ?? "Callyzer sync incomplete");
      }
      return aggregate;
    }
    cursor = chunk.cursor;
  }
}

/** Org-wide pull (cron / admin). Does not advance per-phone watermarks. */
export async function runCallyzerSync(args?: {
  lookbackDays?: number;
  pageSize?: number;
}): Promise<CallyzerSyncResult> {
  const lookbackDays = Math.min(30, Math.max(1, Number(args?.lookbackDays ?? 1)));
  const toTs = Math.floor(Date.now() / 1000);
  const fromTs = toTs - lookbackDays * 24 * 60 * 60;

  const staffRows = await sql<{ callyzerNumber: string }[]>`
    SELECT callyzer_number AS "callyzerNumber"
    FROM staff
    WHERE active = true
      AND callyzer_number IS NOT NULL
      AND length(regexp_replace(callyzer_number, '\\D', '', 'g')) >= 10
  `;

  if (staffRows.length === 0) {
    return buildResult({
      synced: 0,
      inserted: 0,
      skipped: 0,
      unmapped: 0,
      fromTs,
      toTs,
      lookbackDays,
      mappedStaff: 0,
      message: "No staff with Callyzer numbers found",
    });
  }

  const empNumbers = [...new Set(staffRows.map((s) => normalizePhone(s.callyzerNumber)))];
  const stats = await pullCallyzerRange({ empNumbers, fromTs, toTs, pageSize: args?.pageSize });

  return buildResult({
    ...stats,
    fromTs,
    toTs,
    lookbackDays,
    mappedStaff: staffRows.length,
  });
}

/** @deprecated Use runCallyzerSync */
export const runSalesCallyzerSync = runCallyzerSync;
