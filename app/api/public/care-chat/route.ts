import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { runCarePublicChat, type CareChatMessage } from "@/lib/care-public-chat";
import {
  appendPublicChatMessage,
  getPublicChatSession,
} from "@/lib/support-chat-session";
import {
  formatVisitorContextForAi,
  SUPPORT_SEGMENT_LABELS,
  type SupportVisitorSegment,
} from "@/lib/support-chat-intake";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    history?: CareChatMessage[];
    sessionId?: string;
  };

  const message = body.message?.trim();
  const sessionId = body.sessionId?.trim();

  if (!sessionId) {
    return NextResponse.json(
      { data: null, error: "Please complete the short intro form before chatting." },
      { status: 400 },
    );
  }
  if (!message || message.length < 2) {
    return NextResponse.json({ data: null, error: "Message is required." }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ data: null, error: "Message is too long." }, { status: 400 });
  }

  const history = Array.isArray(body.history)
    ? body.history
        .filter(
          (m): m is CareChatMessage =>
            Boolean(m) &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string",
        )
        .slice(-8)
    : [];

  try {
    const payload = await withTransaction(async (tx) => {
      const session = await getPublicChatSession(tx, sessionId);
      if (!session) {
        return { kind: "error" as const, message: "Session expired. Please refresh and start again." };
      }

      const segment = session.segment as SupportVisitorSegment;
      const visitorContext = formatVisitorContextForAi({
        name: session.name,
        phone: session.phone,
        visitorKind: session.visitorKind,
        segment,
        segmentLabel: SUPPORT_SEGMENT_LABELS[segment] ?? session.segment,
        contextSnapshot: session.contextSnapshot,
      });

      await appendPublicChatMessage(tx, sessionId, "user", message);

      const ai = await runCarePublicChat(tx, {
        message,
        history,
        visitorContext,
        visitorName: session.name,
        segment,
        contextSnapshot: session.contextSnapshot,
        sessionId,
      });

      await appendPublicChatMessage(tx, sessionId, "assistant", ai.reply, ai.replySource);

      return {
        kind: "ok" as const,
        reply: ai.reply,
        sources: ai.docTitles,
        replySource: ai.replySource,
      };
    });

    if (payload.kind === "error") {
      return NextResponse.json({ data: null, error: payload.message }, { status: 400 });
    }

    return NextResponse.json({
      data: {
        reply: payload.reply,
        sources: payload.sources,
        replySource: payload.replySource,
      },
      error: null,
    });
  } catch (err) {
    console.error("[public/care-chat]", err);
    return NextResponse.json(
      {
        data: null,
        error: "Unable to respond right now. Please try again or contact care@olready.in.",
      },
      { status: 500 },
    );
  }
}
