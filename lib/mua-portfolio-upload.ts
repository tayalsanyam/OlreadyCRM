import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isLocalPortfolioPath,
  MAX_MUA_PORTFOLIO_BYTES,
  MUA_PORTFOLIO_MIME_TYPES,
} from "@/lib/mua-portfolio-shared";

export {
  MAX_MUA_PORTFOLIO_BYTES,
  MAX_MUA_PORTFOLIO_ITEMS,
  MUA_PORTFOLIO_MIME_TYPES,
} from "@/lib/mua-portfolio-shared";

export async function saveMuaPortfolioFile(
  muaId: string,
  file: File
): Promise<{ publicPath: string; mime: string }> {
  const mime = file.type || "application/octet-stream";
  if (!MUA_PORTFOLIO_MIME_TYPES.has(mime)) {
    throw new Error("Only JPEG, PNG, WebP, or GIF images are allowed");
  }
  if (file.size > MAX_MUA_PORTFOLIO_BYTES) {
    throw new Error("Image must be under 8 MB");
  }

  const uploadDir = path.join(process.cwd(), "uploads", "mua-portfolio");
  await mkdir(uploadDir, { recursive: true });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const savedName = `${muaId}-${Date.now()}-${safeName}`;
  const diskPath = path.join(uploadDir, savedName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(diskPath, bytes);

  return {
    publicPath: `/uploads/mua-portfolio/${savedName}`,
    mime,
  };
}

export async function deleteLocalPortfolioFile(mediaUrl: string): Promise<void> {
  if (!isLocalPortfolioPath(mediaUrl)) return;
  const rel = mediaUrl.replace(/^\/uploads\//, "");
  try {
    await unlink(path.join(process.cwd(), "uploads", rel));
  } catch {
    // file may already be gone
  }
}
