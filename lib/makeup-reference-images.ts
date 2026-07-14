export const MAX_MAKEUP_REFERENCE_IMAGES = 12;
export const MAX_MAKEUP_REFERENCE_BYTES = 8 * 1024 * 1024;

export const MAKEUP_REFERENCE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export type MakeupReferenceImage = {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  createdAt: string;
};
