import type { TransactionSql } from "@/db/index";
import { matchLeadByPhone } from "@/lib/ticket-lead-match";
import type { LedgerPasteRow } from "@/lib/ledger-excel-parse";

export type LedgerMatchRow = LedgerPasteRow & {
  matchedLeadId: string | null;
  matchConfidence: number;
  matchFlags: string[];
};

export async function matchLedgerRows(
  tx: TransactionSql,
  rows: LedgerPasteRow[],
  muaId: string | null
): Promise<LedgerMatchRow[]> {
  const out: LedgerMatchRow[] = [];

  for (const row of rows) {
    const matches = await matchLeadByPhone(tx, row.leadPhone, muaId);
    if (matches.length === 0) {
      out.push({
        ...row,
        matchedLeadId: null,
        matchConfidence: 0,
        matchFlags: ["not_in_crm"],
      });
      continue;
    }
    if (matches.length > 1) {
      out.push({
        ...row,
        matchedLeadId: matches[0]!.leadId,
        matchConfidence: 0.5,
        matchFlags: ["multiple_match"],
      });
      continue;
    }
    out.push({
      ...row,
      matchedLeadId: matches[0]!.leadId,
      matchConfidence: matches[0]!.confidence,
      matchFlags: [],
    });
  }

  return out;
}
