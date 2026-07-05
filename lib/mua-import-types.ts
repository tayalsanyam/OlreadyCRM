import type { ImportMuaRowPayload, MuaImportProfile } from "@/lib/mua-import";

/** Rows per HTTP chunk — conservative for Vercel (same idea as Callyzer). */
export const MUA_IMPORT_CHUNK_SIZE = 20;

/** Pause between chunk requests from the browser. */
export const MUA_IMPORT_CHUNK_PAUSE_MS = 500;

export type MuaImportChunkMeta = {
  startIndex: number;
  totalRows: number;
};

export type MuaImportChunkResult = {
  imported: number;
  skipped: number;
  errors: string[];
  duplicates: Array<{ name: string; phone: string; reason: string }>;
  processedRows: number;
  totalRows: number;
  done: boolean;
};

export type MuaImportChainedResult = {
  imported: number;
  skipped: number;
  errors: string[];
  duplicates: Array<{ name: string; phone: string; reason: string }>;
};

export type MuaImportRowPayload = ImportMuaRowPayload;

export function toImportPayload(row: ImportMuaRowPayload): ImportMuaRowPayload {
  return {
    name: row.name,
    city: row.city,
    regions: row.regions,
    phone: row.phone,
    email: row.email,
    source: row.source,
    instagram: row.instagram,
    whatsapp: row.whatsapp,
    bio: row.bio,
    planTier: row.planTier,
    planExpiry: row.planExpiry,
    leadCap: row.leadCap,
    leadBudget: row.leadBudget,
    planStates: row.planStates,
    planRegions: row.planRegions,
    planCities: row.planCities,
  };
}

export type ImportMuasInChunksOptions = {
  profile: MuaImportProfile;
  rows: ImportMuaRowPayload[];
  chunkSize?: number;
  importUrl?: string;
  onProgress?: (progress: { processedRows: number; totalRows: number; importedTotal: number }) => void;
};
