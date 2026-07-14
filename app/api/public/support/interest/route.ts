import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { isValidPhone10 } from "@/lib/validation";
import { createPublicChatSession } from "@/lib/support-chat-session";
import { createSupportInquiry } from "@/lib/support-inquiry";
import type { SupportVisitorKind, SupportVisitorSegment } from "@/lib/support-chat-intake";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    phone?: string;
    visitorKind?: SupportVisitorKind;
    email?: string;
    city?: string;
    message?: string;
  };

  const name = body.name?.trim();
  const phone = body.phone?.trim();
  const visitorKind = body.visitorKind;

  if (!name || name.length < 2) {
    return NextResponse.json({ data: null, error: "Please enter your name." }, { status: 400 });
  }
  if (!phone || !isValidPhone10(phone)) {
    return NextResponse.json(
      { data: null, error: "Please enter a valid 10-digit mobile number." },
      { status: 400 },
    );
  }
  if (visitorKind !== "mua" && visitorKind !== "bride") {
    return NextResponse.json(
      { data: null, error: "Please select MUA or Bride / customer." },
      { status: 400 },
    );
  }

  const message = body.message?.trim();
  if (!message || message.length < 5) {
    return NextResponse.json(
      { data: null, error: "Please share a short note about what you are looking for." },
      { status: 400 },
    );
  }

  try {
    const data = await withTransaction(async (tx) => {
      const session = await createPublicChatSession(tx, { name, phone, visitorKind });

      const inquiry = await createSupportInquiry(tx, {
        sessionId: session.id,
        visitorKind,
        segment: session.segment as SupportVisitorSegment,
        name,
        phone,
        email: body.email?.trim() || null,
        city: body.city?.trim() || null,
        message,
        source: "interest_form",
        force: true,
      });

      return {
        reference: inquiry?.displayId ?? null,
        segmentLabel: session.segmentLabel,
        message:
          "Thanks — Team Olready has your details. We will reach out on WhatsApp or phone shortly.",
      };
    });

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error("[public/support/interest]", err);
    return NextResponse.json(
      { data: null, error: "Unable to save your details. Please call our care line." },
      { status: 500 },
    );
  }
}
