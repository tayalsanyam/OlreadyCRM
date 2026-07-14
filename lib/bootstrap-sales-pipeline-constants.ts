export const BOOTSTRAP_PIPELINE_BATCH_SIZE = 100;

export function chunkIds<T>(items: T[], size = BOOTSTRAP_PIPELINE_BATCH_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
