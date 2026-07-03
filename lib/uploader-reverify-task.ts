/** Ops tasks auto-created when RM/Commission exits need uploader review. */
export function isUploaderReverifyTaskTitle(title: string): boolean {
  return title.trim().startsWith("Re-verify");
}

export function uploaderReverifyLeadUrl(leadId: string): string {
  return `/upload/leads?tab=review&verify=${encodeURIComponent(leadId)}`;
}
