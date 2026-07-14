/** Client-safe discount helpers (no DB imports). */

export const DISCOUNT_REQUEST_KIND = "deal_discount_request";

export type AdminDiscountTaskDetails = {
  stageLogId: string;
  pipelineId: string;
  muaName: string;
  pipelineStage: string | null;
  listPrice: number;
  discountAmount: number;
  netQuoted: number;
  reason: string;
  requestedByName: string | null;
  requestedRole: string | null;
  requestedAt: string;
  salesNote: string | null;
  paymentAmount: number | null;
  paymentDate: string | null;
  paymentMode: string | null;
  priorPaid: number;
};

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function formatDiscountTaskDisplayTitle(title: string): string {
  return title.replace(/\s*\[PIPE:[^\]]+\]\s*\[DISC:[^\]]+\]\s*$/i, "").trim();
}

export function formatDiscountTaskMeta(details: AdminDiscountTaskDetails): string {
  const parts = [
    details.muaName,
    `${formatInr(details.discountAmount)} off → net ${formatInr(details.netQuoted)}`,
  ];
  if (details.requestedByName) parts.push(`by ${details.requestedByName}`);
  if (details.paymentAmount != null && details.paymentAmount > 0) {
    parts.push(`payment ${formatInr(details.paymentAmount)}`);
  }
  return parts.join(" · ");
}

export function discountTaskTitle(muaName: string, pipelineId: string, stageLogId: string): string {
  return `Approve deal discount — ${muaName} [PIPE:${pipelineId}] [DISC:${stageLogId}]`;
}

export function parseDiscountTaskTitle(title: string): { pipelineId: string; stageLogId: string } | null {
  const pipe = /\[PIPE:([0-9a-f-]{36})\]/i.exec(title);
  const disc = /\[DISC:([0-9a-f-]{36})\]/i.exec(title);
  if (!pipe || !disc) return null;
  return { pipelineId: pipe[1], stageLogId: disc[1] };
}

export function needsDiscountApproval(role: string, discountAmount: number): boolean {
  if (discountAmount <= 0) return false;
  return role === "salesRm" || role === "salesTl";
}

export function formatStaffRoleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  const labels: Record<string, string> = {
    salesRm: "Sales RM",
    salesTl: "Sales TL",
    admin: "Admin",
    owner: "Owner",
    regionalRm: "Regional RM",
    careAgent: "Care Agent",
  };
  return labels[role] ?? role.replace(/_/g, " ");
}

/** CRM admin_review task for a pending deal discount (title may be cleaned in list UI). */
export function isDealDiscountAdminTask(task: {
  kind?: string;
  taskType?: string | null;
  title?: string;
  discountDetails?: unknown;
}): boolean {
  if (task.kind !== "crm" || task.taskType !== "admin_review") return false;
  if (task.discountDetails) return true;
  const title = task.title ?? "";
  if (parseDiscountTaskTitle(title)) return true;
  return title.startsWith("Approve deal discount");
}

export function discountStageLogIdFromTask(task: {
  title?: string;
  discountDetails?: { stageLogId?: string } | null;
}): string | null {
  return (
    parseDiscountTaskTitle(task.title ?? "")?.stageLogId ??
    task.discountDetails?.stageLogId ??
    null
  );
}
