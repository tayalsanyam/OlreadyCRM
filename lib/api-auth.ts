import { getSession } from "@/lib/auth";
import type { SessionUser, UserRole } from "@/lib/types";

export async function requireSession(): Promise<
  { session: SessionUser } | { error: string; status: number }
> {
  const session = await getSession();
  if (!session) {
    return { error: "Unauthorized", status: 401 };
  }
  return { session };
}

export async function requireRoles(
  roles: UserRole[]
): Promise<
  { session: SessionUser } | { error: string; status: number }
> {
  const result = await requireSession();
  if ("error" in result) return result;
  if (!roles.includes(result.session.role)) {
    return { error: "Forbidden", status: 403 };
  }
  return result;
}

export async function requireSalesAccess() {
  return requireRoles(["salesRm", "salesTl", "admin", "owner"]);
}

export async function requireActivationAccess() {
  return requireRoles(["salesActivation", "admin", "owner"]);
}

export async function requireSalesOrActivationAccess() {
  return requireRoles(["salesRm", "salesTl", "salesActivation", "admin", "owner"]);
}

export async function requireGrievanceAccess() {
  return requireRoles(["careAgent", "admin", "owner"]);
}

/** Staff directory for task assignment (ops tasks, support, RM team tasks). */
export async function requireStaffAssigneeAccess() {
  return requireRoles([
    "regionalRm",
    "salesRm",
    "salesTl",
    "careAgent",
    "admin",
    "owner",
  ]);
}

export async function requireGrievanceOperatorAccess() {
  return requireRoles(["careAgent", "admin", "owner"]);
}

export async function requireGrievanceTicketCreateAccess() {
  return requireRoles(["careAgent", "admin", "owner", "feedbackRm"]);
}

export async function requireSalesTlOrAdmin() {
  return requireRoles(["salesTl", "admin", "owner"]);
}

/** Single MUA create (not bulk import). */
export async function requireMuaCreateAccess() {
  return requireRoles([
    "admin",
    "owner",
    "leadUploader",
    "feedbackRm",
    "careAgent",
  ]);
}
