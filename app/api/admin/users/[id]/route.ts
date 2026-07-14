import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { fromDbRole } from "@/lib/db-mappers";
import { permanentlyDeleteStaff } from "@/lib/permanently-delete-staff";
import { validateCallyzerNumberInput } from "@/lib/callyzer-identity";
import type { Region, User, UserRole } from "@/lib/types";

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

function mapStaffRow(r: Record<string, unknown>): User {
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    role: fromDbRole(String(r.role)),
    region: (r.region as User["region"]) ?? null,
    regions: (r.regions as User["regions"]) ?? [],
    active: Boolean(r.active),
    teamId: (r.teamId as string | null) ?? null,
    callyzerNumber: (r.callyzerNumber as string | null) ?? null,
    createdAt: String(r.createdAt ?? r.created_at),
    updatedAt: String(r.updatedAt ?? r.updated_at ?? r.createdAt ?? r.created_at),
    passwordHash: "",
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
    const body = (await request.json()) as {
      name?: string;
      role?: UserRole;
      region?: string | null;
      regions?: Region[];
      active?: boolean;
      password?: string;
      callyzerNumber?: string | null;
    };

    if (USE_MOCK) {
      return NextResponse.json({ data: { ok: true }, error: null });
    }

    const [target] = await sql<{ role: string }[]>`
      SELECT role::text FROM staff WHERE id = ${id}::uuid
    `;
    if (!target) {
      return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
    }

    if (target.role === "owner" && auth.session.role !== "owner") {
      return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
    }

    if (body.role === "owner" && auth.session.role !== "owner") {
      return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
    }

    if (body.callyzerNumber !== undefined) {
      const callyzerError = validateCallyzerNumberInput(body.callyzerNumber);
      if (callyzerError) {
        return NextResponse.json({ data: null, error: callyzerError }, { status: 400 });
      }
    }

    let passwordHash: string | undefined;
    if (body.password) {
      passwordHash = await bcrypt.hash(body.password, 10);
    }

    const regionsArr =
      body.regions !== undefined
        ? body.regions
        : body.region
          ? [body.region as Region]
          : undefined;

    const regionsForDb =
      body.regions !== undefined || body.region !== undefined
        ? (regionsArr?.length ? regionsArr : [])
        : undefined;

    const [row] = await sql`
      UPDATE staff SET
        name = COALESCE(${body.name?.trim() ?? null}, name),
        role = COALESCE(${body.role ? mapRole(body.role) : null}::user_role, role),
        region = COALESCE(
          ${regionsForDb !== undefined ? (regionsForDb[0] ?? body.region ?? null) : null}::region,
          region
        ),
        regions = COALESCE(
          ${regionsForDb !== undefined ? regionsForDb : null}::region[],
          regions
        ),
        active = COALESCE(${body.active ?? null}, active),
        callyzer_number = CASE
          WHEN ${body.callyzerNumber === undefined} THEN callyzer_number
          ELSE ${body.callyzerNumber?.trim() || null}
        END,
        password_hash = COALESCE(${passwordHash ?? null}, password_hash),
        updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING id, email, name, role::text, region::text, regions::text[], callyzer_number AS "callyzerNumber", active, created_at, updated_at
    `;

    if (!row) {
      return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data: mapStaffRow(row as Record<string, unknown>), error: null });
  } catch (error) {
    console.error("PATCH /api/admin/users/[id]:", error);
    const message = error instanceof Error ? error.message : "Failed to update user";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const permanent = new URL(request.url).searchParams.get("permanent") === "1";

  if (USE_MOCK) {
    return NextResponse.json({ data: { ok: true, permanent }, error: null });
  }

  if (id === auth.session.userId) {
    return NextResponse.json({ data: null, error: "You cannot remove your own account" }, { status: 400 });
  }

  try {
    const [target] = await sql<{ role: string }[]>`
      SELECT role::text FROM staff WHERE id = ${id}::uuid
    `;
    if (!target) {
      return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
    }

    if (target.role === "owner") {
      return NextResponse.json({ data: null, error: "Owner accounts cannot be removed" }, { status: 403 });
    }

    if (target.role === "admin" && auth.session.role !== "owner") {
      return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
    }

    if (permanent) {
      await withTransaction((tx) => permanentlyDeleteStaff(tx, id));
      return NextResponse.json({ data: { ok: true, permanent: true }, error: null });
    }

    await sql`
      UPDATE staff SET active = false, updated_at = NOW() WHERE id = ${id}::uuid
    `;

    return NextResponse.json({ data: { ok: true, permanent: false }, error: null });
  } catch (error) {
    console.error("DELETE /api/admin/users/[id]:", error);
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;
    const message = error instanceof Error ? error.message : "Failed to remove user";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
