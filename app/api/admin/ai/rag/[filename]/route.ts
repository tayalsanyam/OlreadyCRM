import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { getRagFileForEdit, saveRagFile } from "@/lib/rag-admin";
import { seedAiKnowledge } from "@/lib/ai-seed";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  try {
    const { filename } = await params;
    const decoded = decodeURIComponent(filename);
    const data = getRagFileForEdit(decoded);
    return NextResponse.json({ data, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load file";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const auth = await requireRoles(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as { content?: string };
  if (typeof body.content !== "string") {
    return NextResponse.json({ data: null, error: "content is required" }, { status: 400 });
  }

  try {
    const { filename } = await params;
    const decoded = decodeURIComponent(filename);
    saveRagFile(decoded, body.content);
    await seedAiKnowledge();

    const data = getRagFileForEdit(decoded);
    return NextResponse.json({
      data: { ...data, synced: true },
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
