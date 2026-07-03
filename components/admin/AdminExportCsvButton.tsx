"use client";

import { Button } from "@/components/ui/Button";
import { adminCsvHref } from "@/lib/admin-csv-export";

export function AdminExportCsvButton({
  apiPath,
  query = "",
  label = "Download CSV",
  disabled = false,
}: {
  apiPath: string;
  query?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="secondary"
      disabled={disabled}
      onClick={() => window.open(adminCsvHref(apiPath, query), "_blank")}
    >
      {label}
    </Button>
  );
}
