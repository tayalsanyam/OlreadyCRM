import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { listRagFiles } from "@/lib/rag-admin";
import { RAG_DIR } from "@/lib/rag-content";

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({
    data: {
      ragDir: "docs/RAG",
      absoluteHint: RAG_DIR,
      files: listRagFiles(),
    },
    error: null,
  });
}
