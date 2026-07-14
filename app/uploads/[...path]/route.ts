import { NextResponse } from "next/server";
import { readUploadFile } from "@/lib/file-storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const rel = segments.join("/");
  if (!rel || rel.includes("..")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const file = await readUploadFile(`/uploads/${rel}`);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(file.bytes, {
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
