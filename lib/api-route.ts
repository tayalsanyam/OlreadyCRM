import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error-response";

type RouteHandler = (request: Request, context?: unknown) => Promise<NextResponse>;

/** Wrap an API route handler so DB connection failures return 503 instead of crashing. */
export function withDbSafeHandler(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return apiErrorResponse(error);
    }
  };
}
