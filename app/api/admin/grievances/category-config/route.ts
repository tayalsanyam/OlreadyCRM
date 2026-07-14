import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import {
  fetchAllCategoryConfig,
  isValidCategorySlug,
  patchCategoryConfig,
  slugifyCategory,
} from "@/lib/ticket-category-registry";

async function urgencySlaHours(urgency: string): Promise<number> {
  const [sla] = await sql<{ highHours: number; mediumHours: number; lowHours: number }[]>`
    SELECT high_hours AS "highHours", medium_hours AS "mediumHours", low_hours AS "lowHours"
    FROM support.sla_config WHERE id = 1
  `;
  if (urgency === "high") return sla?.highHours ?? 24;
  if (urgency === "low") return sla?.lowHours ?? 72;
  return sla?.mediumHours ?? 48;
}

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  try {
    const rows = await fetchAllCategoryConfig(sql, false);
    return NextResponse.json({ data: rows, error: null });
  } catch (err) {
    console.error("[category-config GET]", err);
    const message = err instanceof Error ? err.message : "Could not load categories.";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    category?: string;
    label?: string;
    description?: string;
    raisedByType?: string | null;
    defaultUrgency?: string;
    defaultApprovalTier?: number;
    requiresLedger?: boolean;
    slaHours?: number;
    showOnPublicSupport?: boolean;
  };

  const category = slugifyCategory(body.category ?? body.label ?? "");
  const label = body.label?.trim();
  if (!category || !isValidCategorySlug(category)) {
    return NextResponse.json(
      { data: null, error: "Category slug must be lowercase letters, numbers, and underscores (e.g. payment_delay)." },
      { status: 400 }
    );
  }
  if (!label) {
    return NextResponse.json({ data: null, error: "Label is required." }, { status: 400 });
  }

  const urgency = body.defaultUrgency ?? "medium";
  if (!["high", "medium", "low"].includes(urgency)) {
    return NextResponse.json({ data: null, error: "defaultUrgency must be high, medium, or low." }, { status: 400 });
  }

  const raisedByType =
    body.raisedByType === "bride" || body.raisedByType === "mua" || body.raisedByType === "other"
      ? body.raisedByType
      : body.raisedByType === "shared" || body.raisedByType === ""
        ? null
        : "mua";

  const slaHours = body.slaHours ?? (await urgencySlaHours(urgency));

  try {
    const [row] = await sql`
      INSERT INTO support.category_config (
        category,
        label,
        description,
        raised_by_type,
        default_urgency,
        default_approval_tier,
        requires_ledger,
        sla_hours,
        active,
        show_on_public_support
      ) VALUES (
        ${category},
        ${label},
        ${body.description?.trim() ?? ""},
        ${raisedByType}::support.raised_by_type,
        ${urgency}::support.ticket_urgency,
        ${body.defaultApprovalTier ?? 1},
        ${body.requiresLedger ?? false},
        ${slaHours},
        true,
        ${body.showOnPublicSupport ?? true}
      )
      RETURNING category
    `;
    return NextResponse.json({ data: row, error: null }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Insert failed";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json({ data: null, error: "That category slug already exists." }, { status: 409 });
    }
    console.error("[category-config POST]", err);
    return NextResponse.json({ data: null, error: "Could not create category." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    category?: string;
    label?: string;
    description?: string;
    raisedByType?: string | null;
    defaultUrgency?: string;
    requiresLedger?: boolean;
    slaHours?: number;
    defaultApprovalTier?: number;
    active?: boolean;
    showOnPublicSupport?: boolean;
  };

  if (!body.category) {
    return NextResponse.json({ data: null, error: "category is required" }, { status: 400 });
  }

  if (
    body.defaultUrgency !== undefined &&
    !["high", "medium", "low"].includes(body.defaultUrgency)
  ) {
    return NextResponse.json(
      { data: null, error: "defaultUrgency must be high, medium, or low." },
      { status: 400 }
    );
  }

  const [existing] = await sql<{ category: string }[]>`
    SELECT category FROM support.category_config WHERE category = ${body.category}
  `;
  if (!existing) {
    return NextResponse.json({ data: null, error: "Category not found" }, { status: 404 });
  }

  let slaHours = body.slaHours;
  if (body.defaultUrgency !== undefined && slaHours === undefined) {
    slaHours = await urgencySlaHours(body.defaultUrgency);
  }

  const patch = {
    label: body.label,
    description: body.description,
    raisedByType: body.raisedByType,
    defaultUrgency: body.defaultUrgency,
    defaultApprovalTier: body.defaultApprovalTier,
    requiresLedger: body.requiresLedger,
    slaHours,
    active: body.active,
    showOnPublicSupport: body.showOnPublicSupport,
  };

  const hasPatchField = Object.values(patch).some((value) => value !== undefined);
  if (!hasPatchField) {
    return NextResponse.json({ data: null, error: "No fields to update" }, { status: 400 });
  }

  try {
    const row = await patchCategoryConfig(sql, body.category, patch);
    if (!row) {
      return NextResponse.json({ data: null, error: "Update failed" }, { status: 500 });
    }
    return NextResponse.json({ data: row, error: null });
  } catch (err) {
    console.error("[category-config PATCH]", err);
    const message = err instanceof Error ? err.message : "Could not update category.";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
