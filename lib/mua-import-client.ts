import { apiErrorMessage } from "@/lib/api-json";
import {
  MUA_IMPORT_CHUNK_PAUSE_MS,
  MUA_IMPORT_CHUNK_SIZE,
  type ImportMuasInChunksOptions,
  type MuaImportChainedResult,
  type MuaImportChunkResult,
  toImportPayload,
} from "@/lib/mua-import-types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Client-chained MUA import — one API chunk per HTTP request until done. */
export async function importMuasInChunks(
  options: ImportMuasInChunksOptions,
): Promise<MuaImportChainedResult> {
  const chunkSize = options.chunkSize ?? MUA_IMPORT_CHUNK_SIZE;
  const importUrl = options.importUrl ?? "/api/admin/import-muas";
  const totalRows = options.rows.length;

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const duplicates: MuaImportChainedResult["duplicates"] = [];

  for (let startIndex = 0; startIndex < totalRows; startIndex += chunkSize) {
    const slice = options.rows.slice(startIndex, startIndex + chunkSize);
    const processedRows = Math.min(startIndex + slice.length, totalRows);

    const res = await fetch(importUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: options.profile,
        rows: slice.map(toImportPayload),
        chunkMeta: { startIndex, totalRows },
      }),
    });

    const json = (await res.json()) as { data: MuaImportChunkResult | null; error?: string | null };
    if (!res.ok || !json.data) {
      throw new Error(await apiErrorMessage(res, json.error ?? "MUA import failed"));
    }

    const chunk = json.data;
    imported += chunk.imported;
    skipped += chunk.skipped;
    errors.push(...chunk.errors);
    duplicates.push(...chunk.duplicates);

    options.onProgress?.({
      processedRows,
      totalRows,
      importedTotal: imported,
    });

    if (chunk.done) break;

    if (startIndex + chunkSize < totalRows) {
      await sleep(MUA_IMPORT_CHUNK_PAUSE_MS);
    }
  }

  return { imported, skipped, errors, duplicates };
}
