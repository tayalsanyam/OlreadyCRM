import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";
import type postgres from "postgres";
import { parseCsv, rowsToRecords } from "@/lib/csv-parse";
import { toDbPlanTier } from "@/lib/db-mappers";
import { parseRegionsList, inferRegionFromCity } from "@/lib/mua-region";
import { normalizeMuaRegions } from "@/lib/mua-regions-db";
import type { Region, UserRole } from "@/lib/types";

const execFileAsync = promisify(execFile);

export const ANALYSIS_DIR = path.join(process.cwd(), "Olready Anlysis");
export const DEFAULT_SEED_PASSWORD = process.env.ANALYSIS_SEED_PASSWORD ?? "Olready@2026";

type Sql = postgres.Sql<Record<string, unknown>>;

export type AnalysisSeedResult = {
  users: number;
  muas: number;
  muasSkipped: number;
  pipelines: number;
  pipelinesSkipped: number;
  salesTeamId: string | null;
};

type UserRow = {
  user: string;
  email: string;
  role: string;
  region: string;
  status: string;
  "callyzer no": string;
};

type SalesRawRow = {
  name: string;
  phone: string;
  status: string;
  city: string;
  userType: string;
  planInterest: string;
  notes: string;
  email: string;
};

type MuaPlanOverlay = {
  plan: string;
  planStart: string;
  planEnd: string;
};

const SALES_CRM_FILES: { file: string; ownerEmail: string }[] = [
  { file: "Gaurav - Olready CRM (5).xlsx", ownerEmail: "gauravchettri@olready.in" },
  { file: "Gurkiran - Olready CRM (4).xlsx", ownerEmail: "gurkirankaur@olready.in" },
  { file: "Harsha - Olready CRM (3).xlsx", ownerEmail: "harsha@olready.in" },
  { file: "Vishal - Olready CRM (4).xlsx", ownerEmail: "vishalbhardwaj@olready.in" },
];

function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length < 10) return "";
  const phone = d.slice(-10);
  if (phone === "0000000000" || phone.startsWith("0101010")) return "";
  return phone;
}

function mapRole(raw: string): UserRole | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const map: Record<string, UserRole> = {
    "sales tl": "salesTl",
    "sales rm": "salesRm",
    "sales activation": "salesActivation",
    "feedback rm": "feedbackRm",
    "lead uploader": "leadUploader",
    admin: "admin",
    "regional rm": "regionalRm",
    "commission rm": "commissionRm",
    owner: "owner",
    "care agent": "careAgent",
  };
  return map[s] ?? null;
}

const ROLE_DB: Record<UserRole, string> = {
  regionalRm: "regional_rm",
  commissionRm: "commission_rm",
  leadUploader: "lead_uploader",
  feedbackRm: "feedback_rm",
  careAgent: "care_agent",
  salesRm: "sales_rm",
  salesTl: "sales_tl",
  salesActivation: "sales_activation",
  admin: "admin",
  owner: "owner",
};

export function mapPlanTierFromText(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().toUpperCase();
  if (s.includes("PHOENIX 2") || s.includes("PHOENIX2")) return "phoenix_2";
  if (s.includes("PHOENIX")) return "phoenix";
  if (s.includes("PRIVY") || s.includes("PRIV")) return "highest_privy";
  if (/\bPRO\b/.test(s)) return "pro";
  if (s.includes("PRIME")) return "prime";
  return null;
}

function mapPipelineStage(crmStatus: string): string {
  const s = crmStatus.trim().toUpperCase();
  if (s.includes("PAID") || s.includes("DEAL CLOSED")) return "Deal Closed";
  if (s.includes("REJECT") || s.includes("REFUSED")) return "Rejected";
  if (s.includes("DEMO DONE")) return "Demo Done";
  if (s.includes("DEMO SCHED")) return "Demo Scheduled";
  if (s.includes("SENIOR CALL DONE")) return "Senior Call Done";
  if (s.includes("SENIOR CALL")) return "Senior Call";
  if (s.includes("DETAILS SHARED")) return "Details Shared";
  if (s.includes("FOLLOW UP") || s.includes("FOLLOW-UP")) return "Follow Up";
  if (s.includes("CALL BACK") || s.includes("CALLBACK")) return "Call Back";
  if (s.includes("NOT CONNECT") || s.includes("NOT RESPOND")) return "Not Connected";
  if (s.includes("INBOUND")) return "Untouched";
  if (s.includes("NEAR EXPIRY")) return "Follow Up";
  if (s.includes("CONFIRM")) return "Confirm";
  return "Untouched";
}

async function readCsvRecords(filePath: string): Promise<Record<string, string>[]> {
  const text = await readFile(filePath, "utf8");
  const { headers, rows } = parseCsv(text);
  return rowsToRecords(headers, rows);
}

async function xlsxJson<T>(mode: "users" | "sales-raw", filePath: string): Promise<T[]> {
  const script = path.join(process.cwd(), "scripts", "extract-analysis-xlsx.py");
  const { stdout } = await execFileAsync("python3", [script, mode, filePath], {
    maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(stdout) as T[];
}

export async function seedAnalysisUsers(sql: Sql): Promise<number> {
  const userFile = path.join(ANALYSIS_DIR, "current company data", "Olready User List.xlsx");
  const rows = await xlsxJson<UserRow>("users", userFile);
  const hash = await bcrypt.hash(DEFAULT_SEED_PASSWORD, 10);
  let count = 0;

  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    const role = mapRole(row.role ?? "");
    if (!email || !role) continue;
    if ((row.status ?? "").toLowerCase() === "inactive") continue;

    const regions = parseRegionsList((row.region ?? "").replace(/—/g, "").replace(/\u2014/g, ""));
    const region: Region | null =
      regions.length === 4 ? null : regions.length === 1 ? regions[0]! : null;
    const regionsForDb = regions.length ? regions : [];

    const callyzer = normalizePhone(row["callyzer no"] ?? "");

    await sql`
      INSERT INTO staff (email, password_hash, name, role, region, regions, callyzer_number, active)
      VALUES (
        ${email},
        ${hash},
        ${row.user?.trim() || email},
        ${ROLE_DB[role]}::user_role,
        ${region ? sql`${region}::region` : regionsForDb[0] ? sql`${regionsForDb[0]}::region` : null},
        ${regionsForDb}::region[],
        ${callyzer || null},
        true
      )
      ON CONFLICT (email) DO UPDATE SET
        password_hash = ${hash},
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        region = EXCLUDED.region,
        regions = EXCLUDED.regions,
        callyzer_number = COALESCE(EXCLUDED.callyzer_number, staff.callyzer_number),
        active = true,
        team_id = NULL
    `;
    count++;
  }

  return count;
}

async function loadPlanOverlay(): Promise<Map<string, MuaPlanOverlay>> {
  const enriched = path.join(ANALYSIS_DIR, "reports", "mua_till_date_enriched.csv");
  const map = new Map<string, MuaPlanOverlay>();
  try {
    const records = await readCsvRecords(enriched);
    for (const r of records) {
      const phone = normalizePhone(r.phone ?? "");
      if (!phone) continue;
      map.set(phone, {
        plan: r.plan ?? "",
        planStart: (r.plan_start ?? r.planStart ?? "").slice(0, 10),
        planEnd: (r.plan_end ?? r.planEnd ?? "").slice(0, 10),
      });
    }
  } catch {
    // optional file
  }
  return map;
}

async function loadCityRegionMap(sql: Sql): Promise<Map<string, Region>> {
  const rows = await sql<{ city: string; region: string }[]>`
    SELECT lower(trim(city)) AS city, region::text AS region FROM city_regions
  `;
  const map = new Map<string, Region>();
  for (const row of rows) map.set(row.city, row.region as Region);
  return map;
}

function resolveRegions(city: string, cityMap: Map<string, Region>): Region[] {
  const norm = city.trim().toLowerCase();
  if (cityMap.has(norm)) return [cityMap.get(norm)!];
  const inferred = inferRegionFromCity(city);
  return normalizeMuaRegions(inferred ? [inferred] : [], city);
}

type PreparedMua = {
  displayId: string;
  name: string;
  phone: string;
  city: string;
  email: string | null;
  whatsapp: string | null;
  alternatePhone: string | null;
  status: string;
  planTier: string | null;
  planExpiry: string | null;
  bio: string | null;
  regions: Region[];
  planStart: string | null;
  planEnd: string | null;
  historyTier: string | null;
};

export async function seedAnalysisMuas(
  sql: Sql,
  opts: { fresh?: boolean } = {}
): Promise<{ imported: number; skipped: number }> {
  const masterPath = path.join(ANALYSIS_DIR, "makeup_artists.csv");
  const planOverlay = await loadPlanOverlay();
  const cityMap = await loadCityRegionMap(sql);
  const records = await readCsvRecords(masterPath);

  const [maxRow] = await sql<{ n: number }[]>`
    SELECT COALESCE(
      MAX((regexp_match(display_id, '^MUA-([0-9]+)$'))[1]::int),
      0
    ) AS n
    FROM muas
    WHERE display_id ~ '^MUA-[0-9]+$'
      AND length((regexp_match(display_id, '^MUA-([0-9]+)$'))[1]) <= 6
  `;
  const idOffset = opts.fresh ? 0 : (maxRow?.n ?? 0);

  const seenPhones = new Set<string>();
  const prepared: PreparedMua[] = [];
  let skipped = 0;

  for (const r of records) {
    const name = (r.Name ?? r.name ?? "").trim();
    const phone = normalizePhone(r.Phone ?? r.phone ?? "");
    const city = (r.City ?? r.city ?? "Delhi").trim() || "Delhi";
    if (!name || !phone || seenPhones.has(phone)) {
      skipped++;
      continue;
    }
    seenPhones.add(phone);

    const overlay = planOverlay.get(phone);
    const dbTier = toDbPlanTier(mapPlanTierFromText(overlay?.plan) as never);
    const planEnd = overlay?.planEnd || null;
    const isActivePlan =
      dbTier &&
      planEnd &&
      !Number.isNaN(Date.parse(planEnd)) &&
      new Date(planEnd) >= new Date();

    const statusRaw = (r.Status ?? r.status ?? "Active").toLowerCase();

    prepared.push({
      displayId: `MUA-${String(idOffset + prepared.length + 1).padStart(4, "0")}`,
      name,
      phone,
      city,
      email: (r.Email ?? r.email ?? "").trim() || null,
      whatsapp: normalizePhone(r.Whatsapp ?? r.whatsapp ?? "") || null,
      alternatePhone: normalizePhone(r["Alternate Phone"] ?? r.alternate_phone ?? "") || null,
      status: statusRaw === "inactive" ? "inactive" : "active",
      planTier: isActivePlan ? dbTier : null,
      planExpiry: isActivePlan ? planEnd : null,
      bio: (r.Experience ?? r.experience ?? "").trim() || null,
      regions: resolveRegions(city, cityMap),
      planStart: overlay?.planStart || null,
      planEnd: overlay?.planEnd || null,
      historyTier: dbTier,
    });
  }

  let imported = 0;
  const batchSize = 200;

  for (let i = 0; i < prepared.length; i += batchSize) {
    const chunk = prepared.slice(i, i + batchSize);
    const batchEnd = Math.min(i + chunk.length, prepared.length);
    process.stdout.write(
      `\r     MUAs: ${batchEnd}/${prepared.length} (${chunk[0]?.displayId}–${chunk[chunk.length - 1]?.displayId})`
    );

    await sql.begin(async (tx) => {
      const inserted = await tx<{ id: string; phone: string; displayId: string }[]>`
        INSERT INTO muas ${tx(
          chunk.map((c) => ({
            display_id: `MUA-${c.phone}`,
            name: c.name,
            phone: c.phone,
            city: c.city,
            email: c.email,
            whatsapp: c.whatsapp,
            alternate_phone: c.alternatePhone,
            source: null,
            status: c.status,
            plan_tier: c.planTier,
            plan_expiry: c.planExpiry,
            bio: c.bio,
          }))
        )}
        RETURNING id, phone, display_id AS "displayId"
      `;

      const regionRows: { muaId: string; region: Region }[] = [];
      const historyRows: {
        muaId: string;
        tier: string;
        start: string | null;
        end: string | null;
      }[] = [];

      for (const row of inserted) {
        const src = chunk.find((c) => c.phone === row.phone);
        if (!src) continue;
        for (const region of src.regions) {
          regionRows.push({ muaId: row.id, region });
        }
        if (src.historyTier && src.planStart) {
          historyRows.push({
            muaId: row.id,
            tier: src.historyTier,
            start: src.planStart,
            end: src.planEnd,
          });
        }
      }

      if (regionRows.length) {
        await tx`
          INSERT INTO mua_regions (mua_id, region)
          SELECT r.mua_id::uuid, r.region::region
          FROM UNNEST(
            ${regionRows.map((r) => r.muaId)}::text[],
            ${regionRows.map((r) => r.region)}::text[]
          ) AS r(mua_id, region)
          ON CONFLICT DO NOTHING
        `;
      }

      if (historyRows.length) {
        await tx`
          INSERT INTO mua_plan_history (mua_id, plan_tier, assigned_at, expiry_at, notes)
          SELECT
            h.mua_id::uuid,
            h.plan_tier::plan_tier,
            h.assigned_at::date,
            h.expiry_at::date,
            'Imported from Olready Analysis'
          FROM UNNEST(
            ${historyRows.map((h) => h.muaId)}::text[],
            ${historyRows.map((h) => h.tier)}::text[],
            ${historyRows.map((h) => h.start)}::text[],
            ${historyRows.map((h) => h.end)}::text[]
          ) AS h(mua_id, plan_tier, assigned_at, expiry_at)
        `;
      }

      imported += inserted.length;
    });
  }

  if (prepared.length) process.stdout.write("\n");
  return { imported, skipped };
}

export async function seedAnalysisSalesPipelines(sql: Sql): Promise<{
  pipelines: number;
  skipped: number;
  salesTeamId: string | null;
}> {
  const staffByEmail = new Map<string, string>();
  const staffRows = await sql<{ id: string; email: string }[]>`
    SELECT id, lower(email) AS email FROM staff WHERE active = true
  `;
  for (const s of staffRows) staffByEmail.set(s.email, s.id);

  const [tl] = await sql<{ id: string }[]>`
    SELECT id FROM staff WHERE email = 'gauravchettri@olready.in' LIMIT 1
  `;
  let salesTeamId: string | null = null;
  if (tl?.id) {
    const salesRmIds = staffRows
      .filter((s) =>
        ["gurkirankaur@olready.in", "harsha@olready.in", "vishalbhardwaj@olready.in", "sannikumar@olready.in"].includes(
          s.email
        )
      )
      .map((s) => s.id);

    const [team] = await sql<{ id: string }[]>`
      INSERT INTO sales.teams (name, tl_id)
      VALUES ('Olready Sales', ${tl.id}::uuid)
      RETURNING id
    `;
    salesTeamId = team?.id ?? null;
    if (salesTeamId) {
      await sql`
        UPDATE staff SET team_id = ${salesTeamId}::uuid
        WHERE id = ANY(${[tl.id, ...salesRmIds]}::uuid[])
      `;
    }
  }

  const muaByPhone = new Map<string, string>();
  const muas = await sql<{ id: string; phone: string }[]>`
    SELECT id, phone FROM muas WHERE phone IS NOT NULL
  `;
  for (const m of muas) {
    const p = normalizePhone(m.phone);
    if (p) muaByPhone.set(p, m.id);
  }

  const activePipelineMuas = new Set(
    (
      await sql<{ muaId: string }[]>`
        SELECT mua_id AS "muaId" FROM sales.pipeline
        WHERE status = 'active' AND stage <> 'Rejected'
      `
    ).map((r) => r.muaId)
  );

  let pipelines = 0;
  let skipped = 0;

  for (const { file, ownerEmail } of SALES_CRM_FILES) {
    const filePath = path.join(ANALYSIS_DIR, "current company data", file);
    let rows: SalesRawRow[] = [];
    try {
      rows = await xlsxJson<SalesRawRow>("sales-raw", filePath);
    } catch {
      continue;
    }
    const assigneeId = staffByEmail.get(ownerEmail.toLowerCase());
    if (!assigneeId) continue;

    for (const row of rows) {
      const phone = normalizePhone(row.phone);
      if (!phone) {
        skipped++;
        continue;
      }
      const muaId = muaByPhone.get(phone);
      if (!muaId) {
        skipped++;
        continue;
      }

      if (activePipelineMuas.has(muaId)) {
        skipped++;
        continue;
      }
      activePipelineMuas.add(muaId);

      const muaType = row.userType?.toLowerCase().includes("existing") ? "re_engage" : "candidate";
      const stage = mapPipelineStage(row.status || "Untouched");

      const [pipeline] = await sql<{ id: string }[]>`
        INSERT INTO sales.pipeline (mua_id, mua_type, stage, status, assigned_to, sales_closed_by)
        VALUES (
          ${muaId}::uuid,
          ${muaType},
          ${stage},
          'active',
          ${assigneeId}::uuid,
          ${assigneeId}::uuid
        )
        RETURNING id
      `;
      if (!pipeline) {
        skipped++;
        continue;
      }

      if (row.notes?.trim()) {
        await sql`
          INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
          VALUES (
            ${pipeline.id}::uuid,
            'note',
            ${row.notes.trim().slice(0, 2000)},
            ${assigneeId}::uuid,
            ${sql.json({ source: "analysis_crm_import", file })}
          )
        `;
      }

      pipelines++;
    }
  }

  return { pipelines, skipped, salesTeamId };
}

export async function seedFromAnalysis(sql: Sql): Promise<AnalysisSeedResult> {
  const users = await seedAnalysisUsers(sql);
  const muaResult = await seedAnalysisMuas(sql, { fresh: true });
  const pipeResult = await seedAnalysisSalesPipelines(sql);

  return {
    users,
    muas: muaResult.imported,
    muasSkipped: muaResult.skipped,
    pipelines: pipeResult.pipelines,
    pipelinesSkipped: pipeResult.skipped,
    salesTeamId: pipeResult.salesTeamId,
  };
}
