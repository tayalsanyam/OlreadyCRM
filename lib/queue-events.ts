/** Notify queue views to drop a lead from local state (archived / NI / hostile). */
export function notifyLeadRemovedFromQueue(leadId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("lead-removed-from-queue", { detail: { leadId } })
  );
}
