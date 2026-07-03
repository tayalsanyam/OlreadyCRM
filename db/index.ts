import postgres from "postgres";
import { toDbUnavailableError, isDbConnectionError, wrapDbPromise } from "@/lib/db-connection-error";

function withRmSearchPath(url: string): string {
  if (url.includes("search_path")) return url;
  const sep = url.includes("?") ? "&" : "?";
  // 45s cap so a stuck query cannot hold the only pooler slot indefinitely
  return `${url}${sep}options=-c%20search_path%3Drm%20-c%20statement_timeout%3D45000`;
}

/** Prefer direct URL; else use Supabase transaction pooler (6543) instead of session pooler. */
function resolveConnectionString(): { url: string; pooler: boolean; txMode: boolean } {
  const direct = process.env.DATABASE_URL_DIRECT;
  if (direct) {
    return {
      url: withRmSearchPath(direct),
      pooler: direct.includes("pooler.supabase.com"),
      txMode: direct.includes(":6543"),
    };
  }

  let raw = process.env.DATABASE_URL ?? "postgresql://localhost:5432/olready_crm";

  // Session pooler (:5432) exhausts connections quickly in dev — use transaction pooler
  if (raw.includes("pooler.supabase.com:5432")) {
    raw = raw.replace("pooler.supabase.com:5432", "pooler.supabase.com:6543");
    return {
      url: withRmSearchPath(raw),
      pooler: true,
      txMode: true,
    };
  }

  return {
    url: withRmSearchPath(raw),
    pooler: raw.includes("pooler.supabase.com"),
    txMode: raw.includes(":6543"),
  };
}

const { url: connectionString, pooler, txMode } = resolveConnectionString();
const isSupabase = connectionString.includes("supabase.co");

const globalForDb = globalThis as unknown as {
  olreadySql?: ReturnType<typeof postgres>;
  olreadyDbLogged?: boolean;
};

// Grievance ticket pages fire several parallel API calls; React Strict Mode doubles
// effects in dev. Keep enough headroom so requests queue briefly instead of hanging.
const poolMax = (() => {
  const fromEnv = Number(process.env.DB_POOL_MAX);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  if (!pooler) return 10;
  if (txMode) return process.env.NODE_ENV === "development" ? 12 : 5;
  return 2;
})();

function createSql() {
  const client = postgres(connectionString, {
    transform: postgres.camel,
    max: poolMax,
    ssl: isSupabase ? "require" : false,
    connect_timeout: process.env.NODE_ENV === "development" ? 15 : 30,
    // Short idle timeout was recycling connections every 10s and slowing every page.
    idle_timeout: process.env.NODE_ENV === "development" ? 30 : 20,
    max_lifetime: process.env.NODE_ENV === "development" ? 60 * 30 : undefined,
    ...(txMode ? { prepare: false } : {}),
  });
  return attachDbErrorHandling(client);
}

function attachDbErrorHandling<T extends (...args: never[]) => unknown>(client: T): T {
  const syncHelpers = new Set(["unsafe", "json", "array", "file"]);
  return new Proxy(client, {
    apply(_target, _thisArg, args) {
      return wrapDbPromise(Reflect.apply(client, client, args));
    },
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (syncHelpers.has(String(prop))) {
        return value;
      }
      if (typeof value === "function") {
        return (...args: unknown[]) => wrapDbPromise(value.apply(target, args));
      }
      return value;
    },
  }) as T;
}

const rawSql = globalForDb.olreadySql ?? createSql();
export const sql = rawSql;
if (process.env.NODE_ENV !== "production") {
  globalForDb.olreadySql = sql;
  if (!globalForDb.olreadyDbLogged) {
    const mode = pooler ? (txMode ? "pooler:6543 (tx)" : "pooler") : "direct";
    console.log(`[db] ${mode}, max connections=${poolMax}`);
    if (pooler && !process.env.DATABASE_URL_DIRECT) {
      console.log(
        "[db] Tip: set DATABASE_URL_DIRECT to the direct Supabase host for faster local dev (see .env.example)",
      );
    }
    globalForDb.olreadyDbLogged = true;
  }
}

export type Sql = typeof sql;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TransactionSql = any;

export async function withTransaction<T>(
  fn: (tx: TransactionSql) => Promise<T>
): Promise<T> {
  try {
    return (await sql.begin(fn)) as Promise<T>;
  } catch (error) {
    if (isDbConnectionError(error)) {
      throw toDbUnavailableError(error);
    }
    throw error;
  }
}

/** Batch jobs (e.g. Callyzer day-end pull) may need more than the default 45s per statement. */
export async function withLongTransaction<T>(
  fn: (tx: TransactionSql) => Promise<T>,
  timeoutMs = 300_000,
): Promise<T> {
  try {
    return (await sql.begin(async (tx) => {
      await tx`SELECT set_config('statement_timeout', ${String(timeoutMs)}, true)`;
      return fn(tx);
    })) as Promise<T>;
  } catch (error) {
    if (isDbConnectionError(error)) {
      throw toDbUnavailableError(error);
    }
    throw error;
  }
}

export async function setAuditActor(
  tx: TransactionSql,
  userId: string | null | undefined
): Promise<void> {
  await tx`SELECT set_config('app.user_id', ${userId ?? ""}, true)`;
}

export interface AuditLogParams {
  tableName: string;
  recordId: string;
  action: string;
  actorId: string | null;
  changes?: Record<string, unknown>;
}

export async function insertAuditLog(
  tx: TransactionSql,
  params: AuditLogParams
): Promise<void> {
  await tx`
    INSERT INTO audit_log (table_name, record_id, action, actor_id, changes)
    VALUES (
      ${params.tableName},
      ${params.recordId}::uuid,
      ${params.action},
      ${params.actorId ?? null},
      ${params.changes ? sql.json(params.changes as postgres.JSONValue) : null}
    )
  `;
}

export async function appendComm(
  tx: TransactionSql,
  params: {
    leadId: string;
    entryType: string;
    description: string;
    actorId: string | null;
    muaId?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await tx`
    INSERT INTO comms (lead_id, mua_id, entry_type, description, actor_id, metadata)
    VALUES (
      ${params.leadId}::uuid,
      ${params.muaId ?? null},
      ${params.entryType}::comm_entry_type,
      ${params.description},
      ${params.actorId ?? null},
      ${params.metadata ? sql.json(params.metadata as postgres.JSONValue) : sql.json({})}
    )
  `;
}

export async function generateLeadDisplayId(tx: TransactionSql): Promise<string> {
  const [row] = await tx<{ n: number }[]>`
    SELECT COALESCE(
      MAX((regexp_match(display_id, '^LD-([0-9]+)$'))[1]::int),
      0
    ) + 1 AS n
    FROM bride_leads
    WHERE display_id ~ '^LD-[0-9]+$'
  `;
  return `LD-${String(row?.n ?? 1).padStart(5, "0")}`;
}

export async function generateTaskDisplayId(tx: TransactionSql): Promise<string> {
  const [row] = await tx<{ n: number }[]>`
    SELECT COALESCE(
      MAX((regexp_match(display_id, '^TK-([0-9]+)$'))[1]::int),
      0
    ) + 1 AS n
    FROM rm_tasks
    WHERE display_id ~ '^TK-[0-9]+$'
  `;
  return `TK-${String(row?.n ?? 1).padStart(5, "0")}`;
}

export async function generateMuaDisplayId(tx: TransactionSql): Promise<string> {
  const [row] = await tx<{ n: number }[]>`
    SELECT COALESCE(
      MAX((regexp_match(display_id, '^MUA-([0-9]+)$'))[1]::int),
      0
    ) + 1 AS n
    FROM muas
    WHERE display_id ~ '^MUA-[0-9]+$'
      AND length((regexp_match(display_id, '^MUA-([0-9]+)$'))[1]) <= 6
  `;
  return `MUA-${String(row?.n ?? 1).padStart(4, "0")}`;
}

export interface PaginateParams {
  page?: number;
  pageSize?: number;
  /** Upper bound for pageSize on browse/export lists. Task queues use taskListResponse() instead. */
  maxPageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paginate<T>(
  items: T[],
  params: PaginateParams = {}
): PaginatedResult<T> {
  const page = Math.max(1, params.page ?? 1);
  const maxPageSize = params.maxPageSize ?? 500;
  const pageSize = Math.min(maxPageSize, Math.max(1, params.pageSize ?? 20));
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const start = (page - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export function startOfWeekMonday(d: Date = new Date()): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
