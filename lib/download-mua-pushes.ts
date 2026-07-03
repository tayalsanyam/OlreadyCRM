/** Download all lead pushes for an MUA as CSV. */
export async function downloadMuaPushesCsv(
  muaId: string,
  displayId?: string | null
): Promise<string | null> {
  const res = await fetch(`/api/muas/${muaId}/pushes?format=csv`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? res.statusText;
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const fallback = displayId ? `mua-pushes-${displayId}` : `mua-pushes-${muaId.slice(0, 8)}`;
  const filename = match?.[1] ?? `${fallback}.csv`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  return null;
}
