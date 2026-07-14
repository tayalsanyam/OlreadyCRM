/** Detect transient DB / network failures (Supabase pooler, DNS, timeouts). */

const CONNECTION_ERROR_CODES = new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ECONNABORTED",
  "CONNECTION_DESTROYED",
  "CONNECTION_ENDED",
]);

const CONNECTION_MESSAGE_HINTS = [
  "getaddrinfo",
  "connection terminated",
  "connect timeout",
  "connection timeout",
  "could not connect",
  "server closed the connection",
];

/** PostgreSQL query_canceled — usually statement_timeout, not a dead connection. */
export function isDbStatementTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const e = error as { code?: string; message?: string; cause?: unknown };
  if (e.code === "57014") return true;

  const msg = (e.message ?? "").toLowerCase();
  if (msg.includes("statement timeout") || msg.includes("canceling statement")) return true;

  if (e.cause) return isDbStatementTimeout(e.cause);
  return false;
}

export class DbUnavailableError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    const message =
      cause instanceof Error && cause.message
        ? cause.message
        : "Database connection failed";
    super(message);
    this.name = "DbUnavailableError";
    this.cause = cause;
  }
}

export function isDbConnectionError(error: unknown): boolean {
  if (isDbStatementTimeout(error)) return false;
  if (error instanceof DbUnavailableError) return true;
  if (!error || typeof error !== "object") return false;

  const e = error as {
    code?: string;
    errno?: string | number;
    message?: string;
    cause?: unknown;
  };

  if (e.code && CONNECTION_ERROR_CODES.has(e.code)) return true;
  if (e.errno != null && CONNECTION_ERROR_CODES.has(String(e.errno))) return true;

  const msg = (e.message ?? "").toLowerCase();
  if (CONNECTION_MESSAGE_HINTS.some((hint) => msg.includes(hint))) return true;

  if (e.cause) return isDbConnectionError(e.cause);
  return false;
}

export function toDbUnavailableError(error: unknown): DbUnavailableError {
  if (error instanceof DbUnavailableError) return error;
  return new DbUnavailableError(error);
}

/** Wrap a promise so connection failures throw DbUnavailableError. */
export function wrapDbPromise<T>(result: T): T {
  const maybePromise = result as unknown;
  if (
    maybePromise == null ||
    typeof maybePromise !== "object" ||
    typeof (maybePromise as Promise<unknown>).then !== "function"
  ) {
    return result;
  }
  return (maybePromise as Promise<unknown>).catch((error: unknown) => {
    if (isDbConnectionError(error)) {
      throw toDbUnavailableError(error);
    }
    throw error;
  }) as T;
}

/**
 * Run a DB query with a fallback when the database is unreachable.
 * Logs once in development; never crashes the caller.
 */
export async function safeDbQuery<T>(
  fn: () => Promise<T>,
  fallback: T,
  label = "db",
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isDbConnectionError(error)) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[db] ${label}: connection unavailable — using fallback`);
      }
      return fallback;
    }
    throw error;
  }
}
