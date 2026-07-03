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
      { data: null, error: "Please select whether you are an MUA or a bride/customer." },
      { status: 400 },
    );
  }

  try {
    const session = await withTransaction(async (tx) => {
      const created = await createPublicChatSession(tx, { name, phone, visitorKind });
      await createSupportInquiry(tx, {
        sessionId: created.id,
        visitorKind,
        segment: created.segment as SupportVisitorSegment,
        name,
        phone,
        source: "chat_intake",
      });
      return created;
    });

    return NextResponse.json({
      data: {
        sessionId: session.id,
        segment: session.segment,
        segmentLabel: session.segmentLabel,
        greeting: session.greeting,
        visitorKind: session.visitorKind,
      },
      error: null,
    });
  } catch (err) {
    console.error("[public/care-chat/intake]", err);
    return NextResponse.json(
      { data: null, error: "Unable to start chat. Please try again or call our care line." },
      { status: 500 },
    );
  }
}
