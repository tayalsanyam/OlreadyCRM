import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { exportListCsv, wantsCsv } from "@/lib/admin-csv-export";
import { USE_MOCK } from "@/lib/mock-data";
import { mockUsers } from "@/lib/mock-data";
import { fromDbRole } from "@/lib/db-mappers";
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

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (USE_MOCK) {
    const data = mockUsers.map(({ passwordHash: _, ...u }) => u);
    if (wantsCsv(request)) {
      return exportListCsv("staff-users", [
        { header: "Name", value: (r) => r.name },
        { header: "Email", value: (r) => r.email },
        { header: "Role", value: (r) => r.role },
        { header: "Region", value: (r) => r.region ?? "" },
        { header: "Active", value: (r) => r.active },
      ], data);
    }
    return NextResponse.json({ data, error: null });
  }

  const rows = await sql`
    SELECT id, email, name, role::text, region::text, regions::text[], team_id AS "teamId", callyzer_number AS "callyzerNumber", active, created_at, updated_at
    FROM staff
    ORDER BY name
  `;
  const data = rows.map((r) => mapStaffRow(r as Record<string, unknown>));

  if (wantsCsv(request)) {
    return exportListCsv("staff-users", [
      { header: "Name", value: (r) => r.name },
      { header: "Email", value: (r) => r.email },
      { header: "Role", value: (r) => r.role },
      { header: "Region", value: (r) => r.region ?? "" },
      { header: "Regions", value: (r) => (r.regions ?? []).join("; ") },
      { header: "Team ID", value: (r) => r.teamId ?? "" },
      { header: "Callyzer", value: (r) => r.callyzerNumber ?? "" },
      { header: "Active", value: (r) => r.active },
      { header: "Created", value: (r) => r.createdAt },
    ], data);
  }

  return NextResponse.json({ data, error: null });
}

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      role?: UserRole;
      region?: string | null;
      regions?: Region[];
      callyzerNumber?: string | null;
    };

    if (!body.name?.trim() || !body.email?.trim() || !body.password || !body.role) {
      return NextResponse.json(
        { data: null, error: "name, email, password, role required" },
        { status: 400 }
      );
    }

    if (body.role === "owner") {
      return NextResponse.json(
        { data: null, error: "Cannot create owner via this form" },
        { status: 400 }
      );
    }

    const regionsArr =
      body.regions?.length
        ? body.regions
        : body.region
          ? [body.region as Region]
          : [];
    if (body.role === "regionalRm" && regionsArr.length === 0) {
      return NextResponse.json(
        { data: null, error: "At least one region required for regional RM" },
        { status: 400 }
      );
    }

    const callyzerError = validateCallyzerNumberInput(body.callyzerNumber);
    if (callyzerError) {
      return NextResponse.json({ data: null, error: callyzerError }, { status: 400 });
    }

    if (USE_MOCK) {
      return NextResponse.json({
        data: {
          id: `u-${Date.now()}`,
          email: body.email,
          name: body.name,
          role: body.role,
          region: body.region ?? null,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        error: null,
      });
    }

    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM staff WHERE email = ${body.email.trim().toLowerCase()}
    `;
    if (existing) {
      return NextResponse.json(
        { data: null, error: "Email already in use" },
        { status: 409 }
      );
    }

    const regionsForDb = regionsArr.length ? regionsArr : [];

    const hash = await bcrypt.hash(body.password, 10);
    const [row] = await sql`
      INSERT INTO staff (email, password_hash, name, role, region, regions, callyzer_number, active)
      VALUES (
        ${body.email.trim().toLowerCase()},
        ${hash},
        ${body.name.trim()},
        ${mapRole(body.role)}::user_role,
        ${regionsForDb[0] ?? body.region ?? null}::region,
        ${regionsForDb}::region[],
        ${body.callyzerNumber?.trim() || null},
        true
      )
      RETURNING id, email, name, role::text, region::text, regions::text[], callyzer_number AS "callyzerNumber", active, created_at, updated_at
    `;

    if (!row) {
      return NextResponse.json({ data: null, error: "Failed to create user" }, { status: 500 });
    }

    return NextResponse.json({ data: mapStaffRow(row as Record<string, unknown>), error: null });
  } catch (error) {
    console.error("POST /api/admin/users:", error);
    const message = error instanceof Error ? error.message : "Failed to create user";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
