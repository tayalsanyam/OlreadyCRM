import { NextResponse } from "next/server";
import { DbUnavailableError, isDbConnectionError } from "@/lib/db-connection-error";

const DB_UNAVAILABLE_MESSAGE =
  "Database temporarily unavailable. Check your internet connection and try again.";

export function isDbUnavailable(error: unknown): boolean {
  return error instanceof DbUnavailableError || isDbConnectionError(error);
}

export function apiErrorResponse(
  error: unknown,
  fallbackMessage = "Request failed",
  fallbackStatus = 500,
): NextResponse {
  if (isDbUnavailable(error)) {
    return NextResponse.json({ data: null, error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  const message = error instanceof Error ? error.message : fallbackMessage;
  return NextResponse.json({ data: null, error: message }, { status: fallbackStatus });
}
