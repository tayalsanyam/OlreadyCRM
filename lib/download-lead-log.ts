/** Download full activity log CSV for a single lead (uses /api/leads/[id]/comms). */
export async function downloadLeadLogCsv(leadId: string): Promise<string | null> {
  const res = await fetch(
    `/api/leads/${leadId}/comms?format=csv&limit=10000`,
    { credentials: "include" }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? res.statusText;
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? `lead-log-${leadId}.csv`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  return null;
}
