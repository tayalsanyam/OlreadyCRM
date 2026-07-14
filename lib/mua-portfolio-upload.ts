import {
  isLocalPortfolioPath,
  MAX_MUA_PORTFOLIO_BYTES,
  MUA_PORTFOLIO_MIME_TYPES,
} from "@/lib/mua-portfolio-shared";
import { deleteUploadFile, sanitizeUploadFilename, saveUploadFromFile } from "@/lib/file-storage";

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

  const savedName = `${muaId}-${Date.now()}-${sanitizeUploadFilename(file.name)}`;
  return saveUploadFromFile("mua-portfolio", savedName, file);
}

export async function deleteLocalPortfolioFile(mediaUrl: string): Promise<void> {
  if (!isLocalPortfolioPath(mediaUrl)) return;
  await deleteUploadFile(mediaUrl);
}
