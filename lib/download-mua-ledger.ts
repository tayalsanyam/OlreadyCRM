/** Download MUA ledger CSV (summary or per-MUA detail). */
export async function downloadMuaLedgerCsv(
  apiBase: string,
  params: URLSearchParams
): Promise<string | null> {
  params.set("format", "csv");
  const res = await fetch(`${apiBase}/mua-ledger?${params}`, { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? res.statusText;
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? "mua-ledger.csv";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  return null;
}
