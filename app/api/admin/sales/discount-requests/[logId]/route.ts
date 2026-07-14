import { NextResponse } from "next/server";
import { setAuditActor, sql, withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import {
  approveDiscountRequest,
  loadDiscountRequestDetails,
  rejectDiscountRequest,
} from "@/lib/sales-deal-discount";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ logId: string }> },
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { logId } = await params;
  const data = await loadDiscountRequestDetails(sql, logId);
  if (!data) {
    return NextResponse.json({ data: null, error: "Discount request not found" }, { status: 404 });
  }

  return NextResponse.json({ data, error: null });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ logId: string }> },
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { logId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "approve" | "reject";
    note?: string;
  };

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ data: null, error: "action must be approve or reject" }, { status: 400 });
  }

  const note = body.note?.trim() ?? "";
  if (note.length < 10) {
    return NextResponse.json({ data: null, error: "Note must be at least 10 characters" }, { status: 400 });
  }

  try {
    const data = await withTransaction(async (tx) => {
      await setAuditActor(tx, auth.session.userId);
      if (body.action === "approve") {
        return approveDiscountRequest(tx, logId, auth.session.userId, note);
      }
      return rejectDiscountRequest(tx, logId, auth.session.userId, note);
    });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status: number }).status)
        : 400;
    const message = error instanceof Error ? error.message : "Discount action failed";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
