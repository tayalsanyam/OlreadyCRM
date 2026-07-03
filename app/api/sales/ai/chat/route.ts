import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { runSalesAiChat } from "@/lib/sales-ai";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const auth = await requireRoles(["salesRm", "salesTl", "salesActivation", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    pipelineId?: string;
    history?: ChatMessage[];
  };
  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ data: null, error: "message is required" }, { status: 400 });
  }

  const result = await withTransaction((tx) =>
    runSalesAiChat(tx, {
      message,
      pipelineId: body.pipelineId,
      history: body.history,
    }),
  );

  return NextResponse.json({
    data: {
      reply: result.reply,
      context: {
        pipeline: result.pipeline,
        hasPipelineDetails: result.hasPipelineDetails,
        recentCommsCount: result.recentCommsCount,
        usedDocs: result.usedDocs,
      },
    },
    error: null,
  });
}
