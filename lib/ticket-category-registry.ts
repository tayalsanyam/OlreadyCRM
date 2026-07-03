import type { TransactionSql } from "@/db/index";
import {
  ALL_TICKET_CATEGORY_LABELS,
  BRIDE_TICKET_CATEGORIES,
  OTHER_TICKET_CATEGORIES,
  TICKET_CATEGORIES,
  type TicketCategoryDef,
} from "@/lib/ticket-categories";

function isMissingCategoryMetadataColumn(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const message = err instanceof Error ? err.message : String(err);
  return (
    code === "42703" ||
    message.includes('column "label" does not exist') ||
    message.includes('column "description" does not exist') ||
    message.includes('column "raised_by_type" does not exist') ||
    message.includes('column "show_on_public_support" does not exist')
  );
}

export type CategoryConfigPatch = {
  label?: string;
  description?: string;
  raisedByType?: string | null;
  defaultUrgency?: string;
  defaultApprovalTier?: number;
  requiresLedger?: boolean;
  slaHours?: number;
  active?: boolean;
  showOnPublicSupport?: boolean;
};

function parseRaisedByTypeInput(
  value: string | null | undefined
): "bride" | "mua" | "other" | null | undefined {
  if (value === undefined) return undefined;
  if (value === "shared" || value === "" || value === null) return null;
  if (value === "bride" || value === "mua" || value === "other") return value;
  return undefined;
}

function inferRaisedByType(category: string): string | null {
  if (BRIDE_TICKET_CATEGORIES.some((c) => c.value === category)) return "bride";
  if (OTHER_TICKET_CATEGORIES.some((c) => c.value === category)) return "other";
  if (TICKET_CATEGORIES.some((c) => c.value === category)) return "mua";
  return null;
}

async function fetchAllCategoryConfigLegacy(
  tx: TransactionSql,
  activeOnly: boolean
): Promise<CategoryConfigRecord[]> {
  const rows = await tx<
    Omit<CategoryConfigRecord, "label" | "description" | "raisedByType" | "showOnPublicSupport">[]
  >`
    SELECT
      category,
      default_urgency::text AS "defaultUrgency",
      default_approval_tier AS "defaultApprovalTier",
      requires_ledger AS "requiresLedger",
      sla_hours AS "slaHours",
      active
    FROM support.category_config
    WHERE (${activeOnly} = false OR active = true)
    ORDER BY category ASC
  `;
  return rows.map((row: Omit<CategoryConfigRecord, "label" | "description" | "raisedByType" | "showOnPublicSupport">) => ({
    ...row,
    label:
      ALL_TICKET_CATEGORY_LABELS[row.category] ??
      row.category.replace(/_/g, " "),
    description: "",
    raisedByType: inferRaisedByType(row.category),
    showOnPublicSupport: true,
  }));
}

export type CategoryConfigRecord = {
  category: string;
  label: string;
  description: string;
  raisedByType: string | null;
  defaultUrgency: string;
  defaultApprovalTier: number;
  requiresLedger: boolean;
  slaHours: number;
  active: boolean;
  showOnPublicSupport: boolean;
};

export type TicketCategoryOption = TicketCategoryDef & {
  defaultUrgency: string;
  defaultApprovalTier: number;
  requiresLedger: boolean;
  slaHours: number;
  active: boolean;
};

function rowToOption(row: CategoryConfigRecord): TicketCategoryOption {
  return {
    value: row.category,
    label: row.label || ALL_TICKET_CATEGORY_LABELS[row.category] || row.category.replace(/_/g, " "),
    description: row.description || "",
    defaultUrgency: row.defaultUrgency,
    defaultApprovalTier: row.defaultApprovalTier,
    requiresLedger: row.requiresLedger,
    slaHours: row.slaHours,
    active: row.active,
  };
}

async function patchCategoryConfigLegacy(
  tx: TransactionSql,
  category: string,
  patch: CategoryConfigPatch
): Promise<CategoryConfigRecord | null> {
  if (patch.defaultUrgency !== undefined) {
    await tx`
      UPDATE support.category_config
      SET default_urgency = ${patch.defaultUrgency}::support.ticket_urgency
      WHERE category = ${category}
    `;
  }
  if (patch.defaultApprovalTier !== undefined) {
    await tx`
      UPDATE support.category_config
      SET default_approval_tier = ${patch.defaultApprovalTier}
      WHERE category = ${category}
    `;
  }
  if (patch.requiresLedger !== undefined) {
    await tx`
      UPDATE support.category_config
      SET requires_ledger = ${patch.requiresLedger}
      WHERE category = ${category}
    `;
  }
  if (patch.slaHours !== undefined) {
    await tx`
      UPDATE support.category_config
      SET sla_hours = ${patch.slaHours}
      WHERE category = ${category}
    `;
  }
  if (patch.active !== undefined) {
    await tx`
      UPDATE support.category_config
      SET active = ${patch.active}
      WHERE category = ${category}
    `;
  }

  const [row] = await tx<{
    category: string;
    defaultUrgency: string;
    defaultApprovalTier: number;
    requiresLedger: boolean;
    slaHours: number;
    active: boolean;
  }[]>`
    SELECT
      category,
      default_urgency::text AS "defaultUrgency",
      default_approval_tier AS "defaultApprovalTier",
      requires_ledger AS "requiresLedger",
      sla_hours AS "slaHours",
      active
    FROM support.category_config
    WHERE category = ${category}
  `;

  if (!row) return null;

  return {
    ...row,
    label:
      ALL_TICKET_CATEGORY_LABELS[row.category] ??
      row.category.replace(/_/g, " "),
    description: "",
    raisedByType: inferRaisedByType(row.category),
    showOnPublicSupport: true,
  };
}

export async function patchCategoryConfig(
  tx: TransactionSql,
  category: string,
  patch: CategoryConfigPatch
): Promise<CategoryConfigRecord | null> {
  const raisedByType = parseRaisedByTypeInput(patch.raisedByType);
  const hasPatchField =
    patch.label !== undefined ||
    patch.description !== undefined ||
    raisedByType !== undefined ||
    patch.defaultUrgency !== undefined ||
    patch.defaultApprovalTier !== undefined ||
    patch.requiresLedger !== undefined ||
    patch.slaHours !== undefined ||
    patch.active !== undefined ||
    patch.showOnPublicSupport !== undefined;

  if (!hasPatchField) return null;

  try {
    if (patch.label !== undefined) {
      await tx`
        UPDATE support.category_config
        SET label = ${patch.label.trim()}
        WHERE category = ${category}
      `;
    }
    if (patch.description !== undefined) {
      await tx`
        UPDATE support.category_config
        SET description = ${patch.description.trim()}
        WHERE category = ${category}
      `;
    }
    if (raisedByType !== undefined) {
      await tx`
        UPDATE support.category_config
        SET raised_by_type = ${raisedByType}::support.raised_by_type
        WHERE category = ${category}
      `;
    }
    if (patch.defaultUrgency !== undefined) {
      await tx`
        UPDATE support.category_config
        SET default_urgency = ${patch.defaultUrgency}::support.ticket_urgency
        WHERE category = ${category}
      `;
    }
    if (patch.defaultApprovalTier !== undefined) {
      await tx`
        UPDATE support.category_config
        SET default_approval_tier = ${patch.defaultApprovalTier}
        WHERE category = ${category}
      `;
    }
    if (patch.requiresLedger !== undefined) {
      await tx`
        UPDATE support.category_config
        SET requires_ledger = ${patch.requiresLedger}
        WHERE category = ${category}
      `;
    }
    if (patch.slaHours !== undefined) {
      await tx`
        UPDATE support.category_config
        SET sla_hours = ${patch.slaHours}
        WHERE category = ${category}
      `;
    }
    if (patch.active !== undefined) {
      await tx`
        UPDATE support.category_config
        SET active = ${patch.active}
        WHERE category = ${category}
      `;
    }
    if (patch.showOnPublicSupport !== undefined) {
      await tx`
        UPDATE support.category_config
        SET show_on_public_support = ${patch.showOnPublicSupport}
        WHERE category = ${category}
      `;
    }

    const [row] = await tx<CategoryConfigRecord[]>`
      SELECT
        category,
        COALESCE(NULLIF(TRIM(label), ''), INITCAP(REPLACE(category, '_', ' '))) AS label,
        description,
        raised_by_type::text AS "raisedByType",
        default_urgency::text AS "defaultUrgency",
        default_approval_tier AS "defaultApprovalTier",
        requires_ledger AS "requiresLedger",
        sla_hours AS "slaHours",
        active,
        show_on_public_support AS "showOnPublicSupport"
      FROM support.category_config
      WHERE category = ${category}
    `;
    return row ?? null;
  } catch (err) {
    if (!isMissingCategoryMetadataColumn(err)) throw err;
    return patchCategoryConfigLegacy(tx, category, patch);
  }
}

export async function fetchAllCategoryConfig(
  tx: TransactionSql,
  activeOnly = false
): Promise<CategoryConfigRecord[]> {
  try {
    return await tx<CategoryConfigRecord[]>`
      SELECT
        category,
        COALESCE(NULLIF(TRIM(label), ''), INITCAP(REPLACE(category, '_', ' '))) AS label,
        description,
        raised_by_type::text AS "raisedByType",
        default_urgency::text AS "defaultUrgency",
        default_approval_tier AS "defaultApprovalTier",
        requires_ledger AS "requiresLedger",
        sla_hours AS "slaHours",
        active,
        show_on_public_support AS "showOnPublicSupport"
      FROM support.category_config
      WHERE (${activeOnly} = false OR active = true)
      ORDER BY label ASC, category ASC
    `;
  } catch (err) {
    if (!isMissingCategoryMetadataColumn(err)) throw err;
    return fetchAllCategoryConfigLegacy(tx, activeOnly);
  }
}

export async function fetchTicketCategoriesForSide(
  tx: TransactionSql,
  raisedByType: string
): Promise<TicketCategoryOption[]> {
  try {
    const rows = await tx<CategoryConfigRecord[]>`
      SELECT
        category,
        COALESCE(NULLIF(TRIM(label), ''), INITCAP(REPLACE(category, '_', ' '))) AS label,
        description,
        raised_by_type::text AS "raisedByType",
        default_urgency::text AS "defaultUrgency",
        default_approval_tier AS "defaultApprovalTier",
        requires_ledger AS "requiresLedger",
        sla_hours AS "slaHours",
        active,
        show_on_public_support AS "showOnPublicSupport"
      FROM support.category_config
      WHERE active = true
        AND (
          raised_by_type IS NULL
          OR raised_by_type::text = ${raisedByType}
          OR (${raisedByType} = 'other' AND raised_by_type::text = 'other')
        )
      ORDER BY
        CASE WHEN category = 'other' THEN 1 ELSE 0 END,
        label ASC
    `;
    return rows.map(rowToOption);
  } catch (err) {
    if (!isMissingCategoryMetadataColumn(err)) throw err;
    const all = await fetchAllCategoryConfigLegacy(tx, true);
    const staticDefs: TicketCategoryDef[] =
      raisedByType === "bride"
        ? BRIDE_TICKET_CATEGORIES
        : raisedByType === "other"
          ? OTHER_TICKET_CATEGORIES
          : TICKET_CATEGORIES;
    const byCategory = new Map(all.map((r) => [r.category, r]));
    return staticDefs
      .map((def) => {
        const row = byCategory.get(def.value);
        if (!row) {
          return {
            value: def.value,
            label: def.label,
            description: def.description,
            defaultUrgency: "medium",
            defaultApprovalTier: 1,
            requiresLedger: false,
            slaHours: 48,
            active: true,
          } satisfies TicketCategoryOption;
        }
        return rowToOption(row);
      })
      .filter((r) => r.active);
  }
}

/** Categories shown on the public /support submit concern form. */
export async function fetchPublicSupportCategories(
  tx: TransactionSql,
  raisedByType: string
): Promise<TicketCategoryOption[]> {
  try {
    const rows = await tx<CategoryConfigRecord[]>`
      SELECT
        category,
        COALESCE(NULLIF(TRIM(label), ''), INITCAP(REPLACE(category, '_', ' '))) AS label,
        description,
        raised_by_type::text AS "raisedByType",
        default_urgency::text AS "defaultUrgency",
        default_approval_tier AS "defaultApprovalTier",
        requires_ledger AS "requiresLedger",
        sla_hours AS "slaHours",
        active,
        show_on_public_support AS "showOnPublicSupport"
      FROM support.category_config
      WHERE active = true
        AND show_on_public_support = true
        AND (
          raised_by_type IS NULL
          OR raised_by_type::text = ${raisedByType}
          OR (${raisedByType} = 'other' AND raised_by_type::text = 'other')
        )
      ORDER BY
        CASE WHEN category = 'other' THEN 1 ELSE 0 END,
        label ASC
    `;
    return rows.map(rowToOption);
  } catch (err) {
    if (!isMissingCategoryMetadataColumn(err)) throw err;
    return fetchTicketCategoriesForSide(tx, raisedByType);
  }
}

export async function isPublicSupportCategoryAllowed(
  tx: TransactionSql,
  category: string,
  raisedByType: string
): Promise<boolean> {
  try {
    const [row] = await tx<{ allowed: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM support.category_config
        WHERE category = ${category}
          AND active = true
          AND show_on_public_support = true
          AND (
            raised_by_type IS NULL
            OR raised_by_type::text = ${raisedByType}
            OR (${raisedByType} = 'other' AND raised_by_type::text = 'other')
          )
      ) AS allowed
    `;
    return row?.allowed ?? false;
  } catch (err) {
    if (!isMissingCategoryMetadataColumn(err)) throw err;
    const categories = await fetchTicketCategoriesForSide(tx, raisedByType);
    return categories.some((c) => c.value === category);
  }
}

export async function fetchCategoryLabelMap(
  tx: TransactionSql
): Promise<Record<string, string>> {
  const rows = await fetchAllCategoryConfig(tx, true);
  const map: Record<string, string> = { ...ALL_TICKET_CATEGORY_LABELS };
  for (const row of rows) {
    map[row.category] = row.label;
  }
  return map;
}

export function categorySideGroup(
  raisedByType: string | null,
  category: string
): "bride" | "mua" | "other" | "shared" {
  if (category === "other" || raisedByType == null) return "shared";
  if (raisedByType === "bride") return "bride";
  if (raisedByType === "other") return "other";
  return "mua";
}

export function slugifyCategory(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function isValidCategorySlug(slug: string): boolean {
  return /^[a-z][a-z0-9_]{1,48}$/.test(slug);
}

export type InboxCategoryFilterOption = {
  value: string;
  label: string;
  sides: string[];
};

/** Build inbox / report filter options from active DB categories. */
export function buildInboxCategoryFilterOptions(
  rows: CategoryConfigRecord[]
): InboxCategoryFilterOption[] {
  const byValue = new Map<string, { labels: string[]; sides: Set<string> }>();

  for (const row of rows.filter((r) => r.active)) {
    const side = categorySideGroup(row.raisedByType, row.category);
    const sideLabel =
      side === "bride" ? "Bride" : side === "mua" ? "MUA" : side === "other" ? "Other" : "All";
    const entry = byValue.get(row.category) ?? { labels: [], sides: new Set<string>() };
    entry.labels.push(`${sideLabel}: ${row.label}`);
    if (side !== "shared") entry.sides.add(side);
    else {
      entry.sides.add("bride");
      entry.sides.add("mua");
    }
    byValue.set(row.category, entry);
  }

  return Array.from(byValue.entries())
    .map(([value, meta]) => ({
      value,
      label: meta.labels.join(" · "),
      sides: Array.from(meta.sides),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
