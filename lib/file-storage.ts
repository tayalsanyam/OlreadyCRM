import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const DEFAULT_BUCKET = "crm-uploads";

let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseProjectRef(): string | null {
  const ref = process.env.SUPABASE_PROJECT_REF?.trim();
  if (ref) return ref;

  for (const raw of [process.env.DATABASE_URL_DIRECT, process.env.DATABASE_URL]) {
    const url = raw?.trim();
    if (!url) continue;
    const dbHost = url.match(/@db\.([a-z0-9]+)\.supabase\.co/i)?.[1];
    if (dbHost) return dbHost;
    const poolerRef = url.match(/postgres\.([a-z0-9]+)@/i)?.[1];
    if (poolerRef) return poolerRef;
  }

  return null;
}

function getSupabaseUrl(): string | null {
  const explicit =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const ref = getSupabaseProjectRef();
  if (ref) return `https://${ref}.supabase.co`;

  return null;
}

function getServiceRoleKey(): string | null {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    null
  );
}

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1";
}

function getStorageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || DEFAULT_BUCKET;
}

/** True when uploads should go to Supabase Storage (Vercel / production). */
export function isRemoteStorageEnabled(): boolean {
  return Boolean(getSupabaseUrl() && getServiceRoleKey());
}

function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdmin) return supabaseAdmin;

  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) {
    throw new Error(
      "Supabase Storage is not configured. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL / SUPABASE_PROJECT_REF / DATABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  supabaseAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseAdmin;
}

export function uploadPublicPath(folder: string, savedName: string): string {
  return `/uploads/${folder}/${savedName}`;
}

export function sanitizeUploadFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

function objectKeyFromPublicPath(publicPath: string): string | null {
  if (!publicPath.startsWith("/uploads/")) return null;
  const rel = publicPath.slice("/uploads/".length);
  if (!rel || rel.includes("..")) return null;
  return rel;
}

export async function saveUploadFile(opts: {
  folder: string;
  savedName: string;
  bytes: Buffer;
  mimeType?: string;
}): Promise<{ publicPath: string }> {
  const publicPath = uploadPublicPath(opts.folder, opts.savedName);
  const mimeType = opts.mimeType ?? mimeFromPath(opts.savedName);

  if (isRemoteStorageEnabled()) {
    const key = `${opts.folder}/${opts.savedName}`;
    const { error } = await getSupabaseAdmin()
      .storage.from(getStorageBucket())
      .upload(key, opts.bytes, { contentType: mimeType, upsert: false });
    if (error) throw new Error(error.message);
    return { publicPath };
  }

  if (isVercelRuntime()) {
    throw new Error(
      "File storage is not configured on Vercel. Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY, then redeploy.",
    );
  }

  const uploadDir = path.join(process.cwd(), "uploads", opts.folder);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, opts.savedName), opts.bytes);
  return { publicPath };
}

export async function saveUploadFromFile(
  folder: string,
  savedName: string,
  file: File,
): Promise<{ publicPath: string; mime: string }> {
  const mime = file.type || mimeFromPath(savedName);
  const bytes = Buffer.from(await file.arrayBuffer());
  const { publicPath } = await saveUploadFile({ folder, savedName, bytes, mimeType: mime });
  return { publicPath, mime };
}

export async function readUploadFile(
  publicPath: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const key = objectKeyFromPublicPath(publicPath);
  if (!key) return null;

  if (isRemoteStorageEnabled()) {
    const { data, error } = await getSupabaseAdmin().storage.from(getStorageBucket()).download(key);
    if (error || !data) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    return { bytes, mimeType: mimeFromPath(publicPath) };
  }

  const filePath = path.join(process.cwd(), "uploads", key);
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return null;
    const bytes = await readFile(filePath);
    return { bytes, mimeType: mimeFromPath(filePath) };
  } catch {
    return null;
  }
}

export async function deleteUploadFile(publicPath: string): Promise<void> {
  const key = objectKeyFromPublicPath(publicPath);
  if (!key) return;

  if (isRemoteStorageEnabled()) {
    await getSupabaseAdmin().storage.from(getStorageBucket()).remove([key]);
    return;
  }

  try {
    await unlink(path.join(process.cwd(), "uploads", key));
  } catch {
    // file may already be gone
  }
}
