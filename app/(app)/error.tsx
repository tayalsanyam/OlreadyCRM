"use client";

import { Button } from "@/components/ui/Button";
import { isDbConnectionError } from "@/lib/db-connection-error";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const dbDown =
    error.name === "DbUnavailableError" ||
    isDbConnectionError(error) ||
    /database temporarily unavailable|getaddrinfo|could not connect/i.test(error.message);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 px-6 text-center">
      <h2 className="text-xl font-semibold text-brand">
        {dbDown ? "Database connection issue" : "Something went wrong"}
      </h2>
      <p className="max-w-md text-sm text-slate-muted">
        {dbDown
          ? "We could not reach the database. Check your internet connection and try again."
          : error.message}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
