import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";
import { withTransaction } from "@/db/index";
import {
  dayEndTemplateForRole,
  isDayEndRequiredRole,
  todayIstYmd,
  type DayEndSubmissionType,
} from "@/lib/day-end";
import {
  loadDayEndFormData,
  upsertDayEndCheckout,
} from "@/lib/day-end-queries";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (!isDayEndRequiredRole(auth.session.role)) {
    return NextResponse.json(
      { data: null, error: "Day end checkout is not required for your role" },
      { status: 403 },
    );
  }

  const reportDate = todayIstYmd();

  try {
    const data = await withTransaction((tx) =>
      loadDayEndFormData(tx, auth.session, reportDate),
    );
    return NextResponse.json({ data, error: null });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load day end form");
  }
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const templateKey = dayEndTemplateForRole(auth.session.role);
  if (!templateKey) {
    return NextResponse.json(
      { data: null, error: "Day end checkout is not required for your role" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    submissionType?: DayEndSubmissionType;
    payload?: Record<string, unknown>;
  };

  const reportDate = todayIstYmd();
  const submissionType = body.submissionType === "leave" ? "leave" : "report";

  try {
    const saved = await withTransaction(async (tx) => {
      const payload =
        submissionType === "leave"
          ? { leave: true }
          : (body.payload ?? (await loadDayEndFormData(tx, auth.session, reportDate)).autofill);

      return upsertDayEndCheckout(tx, {
        staffId: auth.session.userId,
        reportDate,
        templateKey,
        submissionType,
        payload: payload as Record<string, unknown>,
      });
    });

    return NextResponse.json({ data: saved, error: null });
  } catch (error) {
    return apiErrorResponse(error, "Failed to save day end checkout");
  }
}
