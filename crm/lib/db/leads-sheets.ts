import { getSheetsClient, getSpreadsheetId, SHEET_NAMES, ensureSheetExists } from "../sheets";
import type { Lead } from "../types";

const LEAD_HEADERS = [
  "id", "name", "city", "company", "email", "phone", "insta_id",
  "bdm", "plan", "status", "source", "remarks", "connected_on",
  "next_follow_up", "committed_date", "original_price", "discount",
  "amount_paid", "amount_balance", "payment_status", "payment_mode",
  "if_part", "created_at", "last_modified",
];

function rowToLead(row: unknown[]): Lead {
  const num = (i: number) => (row[i] != null && row[i] !== "" ? Number(row[i]) : undefined);
  const str = (i: number) => (row[i] != null ? String(row[i]).trim() : undefined);
  const bool = (i: number) => row[i] === true || row[i] === "TRUE" || row[i] === "1";
  return {
    id: String(row[0] ?? ""),
    name: String(row[1] ?? ""),
    city: String(row[2] ?? ""),
    company: str(3),
    email: str(4),
    phone: row[5] != null ? String(row[5]).replace(/\.0$/, "") : undefined,
    insta_id: str(6),
    bdm: String(row[7] ?? ""),
    plan: String(row[8] ?? ""),
    status: (row[9] as Lead["status"]) ?? "UNTOUCHED",
    source: str(10),
    remarks: str(11),
    connected_on: str(12),
    next_follow_up: str(13),
    committed_date: str(14),
    original_price: num(15),
    discount: num(16),
    amount_paid: num(17),
    amount_balance: num(18),
    payment_status: str(19),
    payment_mode: str(20),
    if_part: bool(21),
    created_at: String(row[22] ?? ""),
    last_modified: str(23),
  };
}

function leadToRow(l: Partial<Lead> & { id?: string }): unknown[] {
  return [
    l.id ?? "",
    l.name ?? "",
    l.city ?? "",
    l.company ?? "",
    l.email ?? "",
    l.phone ?? "",
    l.insta_id ?? "",
    l.bdm ?? "",
    l.plan ?? "",
    l.status ?? "UNTOUCHED",
    l.source ?? "manual",
    l.remarks ?? "",
    l.connected_on ?? "",
    l.next_follow_up ?? "",
    l.committed_date ?? "",
    l.original_price ?? "",
    l.discount ?? "",
    l.amount_paid ?? "",
    l.amount_balance ?? "",
    l.payment_status ?? "",
    l.payment_mode ?? "",
    l.if_part ? "TRUE" : "",
    l.created_at ?? new Date().toISOString(),
    l.last_modified ?? "",
  ];
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function getDateRange(preset: string): { from: string; to: string } | null {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate(), day = now.getDay();
  switch (preset) {
    case "mtd":
      return { from: `${y}-${pad(m + 1)}-01`, to: fmt(now) };
    case "pm": {
      const prev = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      return { from: fmt(prev), to: fmt(last) };
    }
    case "wtd": {
      const mon = day === 0 ? -6 : 1 - day;
      const monDate = new Date(now);
      monDate.setDate(d + mon);
      return { from: fmt(monDate), to: fmt(now) };
    }
    case "pw": {
      const mon = day === 0 ? -6 : 1 - day;
      const prevMon = new Date(now);
      prevMon.setDate(d + mon - 7);
      const prevSun = new Date(prevMon);
      prevSun.setDate(prevMon.getDate() + 6);
      return { from: fmt(prevMon), to: fmt(prevSun) };
    }
    default:
      return null;
  }
}

export function getSellingPrice(l: Lead): number {
  if (l.original_price != null && l.discount != null)
    return Math.max(0, l.original_price - l.discount);
  const planMatch = String(l.plan ?? "").match(/(\d+)\s*k/i);
  return planMatch ? parseInt(planMatch[1], 10) * 1000 : 0;
}

export function getBalance(l: Lead): number {
  const selling = getSellingPrice(l);
  const paid = l.amount_paid ?? 0;
  return Math.max(0, selling - paid);
}

function hasCoreDetails(l: Lead): boolean {
  return !!(l.name?.trim() && l.city?.trim() && (l.phone?.trim() || l.email?.trim()));
}

export interface LeadFilters {
  bdm?: string;
  status?: string;
  statuses?: string[];
  plan?: string;
  source?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  datePreset?: string;
  dateField?: "created_at" | "last_modified" | "next_follow_up" | "committed_date";
  teamBdms?: string[];
}

export async function getLeads(filters?: LeadFilters): Promise<Lead[]> {
  await ensureSheetExists(SHEET_NAMES.LEADS, LEAD_HEADERS);
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${SHEET_NAMES.LEADS}!A2:X`,
  });
  const rows = (res.data.values ?? []) as unknown[][];
  let leads: Lead[] = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const l = rowToLead(row);
      if (l.id || l.name) leads.push(l);
    } catch {
      /* skip */
    }
  }

  if (filters?.bdm)
    leads = leads.filter((l) => l.bdm?.toUpperCase() === filters.bdm?.toUpperCase());
  if (filters?.teamBdms?.length)
    leads = leads.filter((l) => filters.teamBdms!.includes(l.bdm));
  if (filters?.status)
    leads = leads.filter((l) => l.status === filters.status);
  if (filters?.statuses?.length)
    leads = leads.filter((l) => new Set(filters.statuses).has(l.status));
  if (filters?.plan)
    leads = leads.filter((l) => l.plan?.toLowerCase().includes(filters.plan!.toLowerCase()));
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    leads = leads.filter(
      (l) =>
        l.name?.toLowerCase().includes(q) ||
        l.city?.toLowerCase().includes(q) ||
        l.phone?.includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.remarks?.toLowerCase().includes(q)
    );
  }

  let dateFrom = filters?.dateFrom;
  let dateTo = filters?.dateTo;
  if (filters?.datePreset && !dateFrom && !dateTo) {
    const range = getDateRange(filters.datePreset);
    if (range) {
      dateFrom = range.from;
      dateTo = range.to;
    }
  }
  const dateField = filters?.dateField ?? "last_modified";
  if (dateFrom || dateTo) {
    leads = leads.filter((l) => {
      const val = l[dateField] || l.created_at || l.connected_on;
      const ref = parseDate(val || "");
      if (!ref) return true;
      const s = ref.toISOString().slice(0, 10);
      if (dateFrom && s < dateFrom) return false;
      if (dateTo && s > dateTo) return false;
      return true;
    });
  }

  leads.sort((a, b) => {
    const am = parseDate(a.last_modified || a.created_at || "");
    const bm = parseDate(b.last_modified || b.created_at || "");
    if (!am) return 1;
    if (!bm) return -1;
    return bm.getTime() - am.getTime();
  });
  return leads;
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const leads = await getLeads();
  return leads.find((l) => l.id === id) ?? null;
}

export async function findDuplicatePhone(phone: string, excludeId?: string): Promise<Lead | null> {
  if (!phone?.trim()) return null;
  const leads = await getLeads();
  return leads.find((l) => l.phone?.trim() === phone.trim() && l.id !== excludeId) ?? null;
}

export async function createLead(lead: Omit<Lead, "id" | "created_at" | "last_modified">): Promise<Lead> {
  if (lead.phone?.trim()) {
    const dup = await findDuplicatePhone(lead.phone);
    if (dup) throw new Error(`Phone already exists for lead: ${dup.name}`);
  }

  const now = new Date().toISOString();
  const newLead: Lead = {
    ...lead,
    id: `L${Date.now()}`,
    created_at: now,
    last_modified: now,
  };
  const hasCore = hasCoreDetails(newLead);
  const status = lead.next_follow_up && hasCore ? "CONTACTED" : (lead.status ?? "UNTOUCHED");
  newLead.status = status as Lead["status"];

  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${SHEET_NAMES.LEADS}!A:X`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [leadToRow(newLead)] },
  });
  return newLead;
}

export async function updateLead(leadId: string, updates: Partial<Lead>): Promise<Lead | null> {
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  const idRes = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${SHEET_NAMES.LEADS}!A2:A`,
  });
  const ids = ((idRes.data.values ?? []) as unknown[][]).flat();
  const rowIdx = ids.findIndex((x) => String(x) === leadId);
  if (rowIdx < 0) return null;

  const leads = await getLeads();
  const existing = leads.find((l) => l.id === leadId);
  if (!existing) return null;

  if (updates.phone?.trim() && updates.phone !== existing.phone) {
    const dup = await findDuplicatePhone(updates.phone, leadId);
    if (dup) throw new Error(`Phone already exists for lead: ${dup.name}`);
  }

  const now = new Date().toISOString();
  let merged = { ...existing, ...updates, id: leadId, last_modified: now };

  if (updates.next_follow_up != null && hasCoreDetails(merged) && merged.status === "UNTOUCHED") {
    merged = { ...merged, status: "CONTACTED" };
  }
  if (merged.status === "DENIED" && updates.lost_reason) {
    merged = { ...merged, remarks: [merged.remarks, `Lost reason: ${updates.lost_reason}`].filter(Boolean).join(". ") };
  }

  const rowNum = rowIdx + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${SHEET_NAMES.LEADS}!A${rowNum}:X${rowNum}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [leadToRow(merged)] },
  });
  return merged;
}

export async function recordPayment(
  leadId: string,
  amount: number,
  mode: string
): Promise<Lead | null> {
  const lead = await getLeadById(leadId);
  if (!lead) return null;
  const selling = getSellingPrice(lead);
  const prevPaid = lead.amount_paid ?? 0;
  const newPaid = prevPaid + amount;
  const balance = Math.max(0, selling - newPaid);
  const ifPart = balance > 0;
  const status = balance <= 0 ? "PAID" : (["CONFIRMED", "PARTLY_PAID"].includes(lead.status) ? "PARTLY_PAID" : lead.status);
  const paymentStatus = balance <= 0 ? "COMPLETE" : "PARTIAL";
  return updateLead(leadId, {
    amount_paid: newPaid,
    amount_balance: balance,
    if_part: ifPart,
    status: status as Lead["status"],
    payment_status: paymentStatus,
    payment_mode: mode,
    last_modified: new Date().toISOString(),
  });
}
