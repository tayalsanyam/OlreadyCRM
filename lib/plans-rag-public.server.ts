import fs from "node:fs";
import path from "node:path";
import { PLANS_RAG_DOC, RAG_DIR, readRagFile } from "@/lib/rag-content";

/** Server-only — reads docs/RAG/plansrag.md for public support AI. */
export function readPublicPlansRagMarkdown(): string {
  const filePath = path.join(RAG_DIR, PLANS_RAG_DOC.file);
  if (!fs.existsSync(filePath)) return "";
  return readRagFile(PLANS_RAG_DOC.file);
}
