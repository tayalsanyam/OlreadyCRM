import { NextResponse } from "next/server";
import { sql, withTransaction, setAuditActor } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import {
  MIGRATABLE_ROLES,
  computeRegionMismatch,
  loadStaffForMigrate,
  migrateStaffWorkload,
  previewStaffWorkload,
  type RegionMismatch,
  type WorkloadPreview,
} from "@/lib/migrate-staff-workload";
import type { Region, UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

type EligibleUser = {
  id: string;
  name: string;
  email: string;
  regions: Region[];
};

function mapRole(role: UserRole): string {
  const m: Record<UserRole, string> = {
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
  return m[role];
}

async function listEligibleSuccessors(
  role: UserRole,
  excludeId: string,
): Promise<EligibleUser[]> {
  const rows = await sql<
    { id: string; name: string; email: string; regions: string[] | null }[]
  >`
    SELECT id, name, email, regions::text[]
    FROM staff
    WHERE role = ${mapRole(role)}::user_role
      AND active = true
      AND id <> ${excludeId}::uuid
    ORDER BY name
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    regions: (r.regions ?? []) as Region[],
  }));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const toStaffId = new URL(request.url).searchParams.get("toStaffId");

  if (USE_MOCK) {
    return NextResponse.json({
      data: {
        migratable: true,
        preview: {} as WorkloadPreview,
        eligible: [],
        regionMismatch: null,
      },
      error: null,
    });
  }

  const source = await loadStaffForMigrate(sql, id);
  if (!source) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  if (source.role === "owner" || source.role === "admin") {
    return NextResponse.json({
      data: {
        migratable: false,
        reason: "Admin and owner accounts do not support workload migration",
        preview: null,
        eligible: [],
        regionMismatch: null,
      },
      error: null,
    });
  }

  if (!MIGRATABLE_ROLES.includes(source.role)) {
    return NextResponse.json({
      data: {
        migratable: false,
        reason: `No operational workload to migrate for ${source.role}`,
        preview: null,
        eligible: [],
        regionMismatch: null,
      },
      error: null,
    });
  }

  const preview = await previewStaffWorkload(sql, id, source.role);
  const eligible = await listEligibleSuccessors(source.role, id);

  let regionMismatch: RegionMismatch | null = null;
  if (toStaffId && source.role === "regionalRm") {
    const target = await loadStaffForMigrate(sql, toStaffId);
    if (target && target.role === source.role) {
      regionMismatch = computeRegionMismatch(preview.leadRegions, target.regions);
    }
  }

  return NextResponse.json({
    data: {
      migratable: true,
      source: { id: source.id, name: source.name, role: source.role, regions: source.regions },
      preview,
      eligible,
      regionMismatch,
    },
    error: null,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const body = (await request.json()) as {
    toStaffId?: string;
    addRegionsToTarget?: Region[];
    skipRegionCheck?: boolean;
  };

  if (!body.toStaffId) {
    return NextResponse.json(
      { data: null, error: "toStaffId is required" },
      { status: 400 },
    );
  }

  if (USE_MOCK) {
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  if (id === body.toStaffId) {
    return NextResponse.json(
      { data: null, error: "Cannot migrate to the same user" },
      { status: 400 },
    );
  }

  try {
    const result = await withTransaction(async (tx) => {
      await setAuditActor(tx, auth.session.userId);
      return migrateStaffWorkload(tx, {
        fromId: id,
        toId: body.toStaffId!,
        actorId: auth.session.userId,
        options: {
          addRegionsToTarget: body.addRegionsToTarget,
          skipRegionCheck: body.skipRegionCheck,
        },
      });
    });

    return NextResponse.json({
      data: {
        ok: true,
        preview: result.preview,
        moved: result.moved,
        regionMismatchResolved: result.regionMismatchResolved,
      },
      error: null,
    });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;
    const message = error instanceof Error ? error.message : "Migration failed";
    const regionMismatch =
      typeof error === "object" && error && "regionMismatch" in error
        ? (error as { regionMismatch: RegionMismatch }).regionMismatch
        : undefined;

    return NextResponse.json(
      { data: regionMismatch ? { regionMismatch } : null, error: message },
      { status },
    );
  }
}
