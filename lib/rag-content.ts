import fs from "node:fs";
import path from "node:path";

export const RAG_DIR = path.join(process.cwd(), "docs", "RAG");
export const LEGAL_ENTITY = "KATALYST INFOMEDIA";

export const PLANS_RAG_DOC = {
  file: "plansrag.md",
  title: "Olready MUA Plans — Pricing",
  category: "plans",
} as const;

export const PLANS_RAG_FILENAME = PLANS_RAG_DOC.file;

/** Legacy CRM-generated pricing doc — not used for public support AI. */
export const PLANS_PRICING_DOC = {
  file: "Olready_Plans_Pricing.md",
  title: "Olready Plans — Pricing & Details",
  category: "plans",
} as const;

export const SUPPORT_POLICY_DOCS = [
  PLANS_RAG_DOC,
  {
    file: "Olready_MUA_Issue_Advisor_Knowledge_Playbook (1).md",
    title: "MUA Issue Advisor Playbook",
    category: "care",
  },
  {
    file: "Olready_Bride_Side_Knowledge_Bank_RAG.md",
    title: "Bride Side Knowledge Bank",
    category: "bride",
  },
  {
    file: "Olready_Master_Knowledge_Dump_No_Pricing.md",
    title: "Master Knowledge (no pricing)",
    category: "general",
  },
] as const;

export const SALES_AI_DOCS = [
  {
    file: "Olready_Sales_Toolkit.md",
    title: "Olready Sales Toolkit",
  },
] as const;

export const SALES_TOOLKIT_SECTIONS = [
  "Approved Brand Identity",
  "MUA Partner Proposition",
  "Olready Assured - Trust Layer",
  "Plan Architecture - No Pricing Version",
  "Lead Reversal Policy - Master Summary",
  "Sales CRM Operating System",
  "Sales Team Operating Model",
  "Messaging Bank - MUA Sales",
  "Reputation and Trust Recovery - Internal Only",
  "Competitive Playbook to Internalize",
] as const;

export function normalizeRagContent(text: string): string {
  return text
    .replace(/KSM Beauty Pvt\.?\s*Ltd\.?/gi, LEGAL_ENTITY)
    .replace(
      /Keep legal entity consistently as KSM Beauty Pvt\.?\s*Ltd\.?/gi,
      `Keep legal entity consistently as ${LEGAL_ENTITY}.`,
    );
}

export function extractH1Sections(source: string, titles: readonly string[]): string {
  const lines = source.split("\n");
  const sections: string[] = [];

  for (const title of titles) {
    const heading = `# ${title}`;
    const startIdx = lines.findIndex((line) => line.trim() === heading);
    if (startIdx < 0) continue;

    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith("# ") && !lines[i].startsWith("## ")) {
        endIdx = i;
        break;
      }
    }

    sections.push(lines.slice(startIdx, endIdx).join("\n").trim());
  }

  const header = [
    "---",
    "title: Olready Sales Toolkit",
    "brand: Olready / Your Smart Beauty Club",
    `legal_entity: ${LEGAL_ENTITY}`,
    "visibility: SALES_INTERNAL",
    "source: Extracted from Olready Master Knowledge Dump",
    "---",
    "",
    "# Olready Sales Toolkit",
    "",
    "Sales execution reference for Olready sales AI: pipeline stages, MUA pitches, plan architecture, objections, and messaging.",
    "",
  ].join("\n");

  return `${header}\n${sections.join("\n\n")}\n`;
}

export function readRagFile(filename: string): string {
  const filePath = path.join(RAG_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing RAG file: ${filePath}`);
  }
  return normalizeRagContent(fs.readFileSync(filePath, "utf8").trim());
}

export function ensureSalesToolkitFile(): string {
  const masterPath = path.join(RAG_DIR, "Olready_Master_Knowledge_Dump_No_Pricing.md");
  if (!fs.existsSync(masterPath)) {
    throw new Error(`Missing master dump: ${masterPath}`);
  }

  const master = normalizeRagContent(fs.readFileSync(masterPath, "utf8"));
  const toolkit = extractH1Sections(master, SALES_TOOLKIT_SECTIONS);
  const toolkitPath = path.join(RAG_DIR, "Olready_Sales_Toolkit.md");

  fs.writeFileSync(toolkitPath, toolkit, "utf8");
  return toolkit;
}
