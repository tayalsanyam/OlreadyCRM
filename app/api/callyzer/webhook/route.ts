import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { ingestCallyzerCall } from "@/lib/callyzer-ingest";
import { normalizePhone } from "@/lib/phone";

type WebhookPayload = {
  call_id?: string;
  id?: string;
  emp_number?: string;
  employee_number?: string;
  phone?: string;
  phone_number?: string;
  client_number?: string;
  direction?: string;
  call_type?: string;
  duration?: number;
  duration_seconds?: number;
  outcome?: string;
  note?: string;
  called_at?: string;
  timestamp?: string;
  call_recording_url?: string;
};

function toDirection(raw?: string): "inbound" | "outbound" | null {
  const v = (raw ?? "").toLowerCase();
  if (v === "incoming" || v === "inbound") return "inbound";
  if (v === "outgoing" || v === "outbound") return "outbound";
  return null;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-callyzer-secret") ?? request.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.CALLYZER_WEBHOOK_SECRET) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as WebhookPayload;
  const callId = body.call_id ?? body.id;
  const empNumber =
    body.emp_number ?? body.employee_number ?? body.phone_number ?? body.phone;
  const clientPhone = body.client_number ?? body.phone_number ?? body.phone;

  if (!callId || !empNumber || !clientPhone) {
    return NextResponse.json(
      { data: null, error: "call_id, emp_number, and client_number required" },
      { status: 400 },
    );
  }

  const calledAt = body.called_at ?? body.timestamp ?? new Date().toISOString();
  const durationSec = Math.max(0, Number(body.duration_seconds ?? body.duration ?? 0));
  const direction = toDirection(body.direction ?? body.call_type);

  const result = await withTransaction((tx) =>
    ingestCallyzerCall(tx, {
      callId,
      empNumber,
      clientPhone,
      direction,
      durationSec,
      calledAt,
      outcome: body.outcome ?? body.note ?? null,
      recordingUrl: body.call_recording_url ?? null,
      source: "callyzer_webhook",
    }),
  );

  return NextResponse.json({
    data: { ok: true, result, clientPhone: normalizePhone(clientPhone) },
    error: null,
  });
}
