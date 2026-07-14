import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { sql } from "@/db/index";
import { isDbConnectionError, safeDbQuery } from "@/lib/db-connection-error";
import { mockUsers, USE_MOCK } from "@/lib/mock-data";
import type { SessionUser, User, UserRole } from "@/lib/types";
import { ROLE_HOME } from "@/lib/types";

const ACCESS_COOKIE = "olready_access";
const REFRESH_COOKIE = "olready_refresh";
const ACCESS_TTL = "8h";
const REFRESH_TTL = "7d";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

function getRefreshSecret(): Uint8Array {
  const secret = process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_REFRESH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

interface TokenPayload extends Record<string, unknown> {
  userId: string;
  email?: string;
  role: UserRole;
  name: string;
  region: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapDbRole(role: string): UserRole {
  const map: Record<string, UserRole> = {
    regional_rm: "regionalRm",
    commission_rm: "commissionRm",
    lead_uploader: "leadUploader",
    feedback_rm: "feedbackRm",
    care_agent: "careAgent",
    sales_rm: "salesRm",
    sales_tl: "salesTl",
    sales_activation: "salesActivation",
    admin: "admin",
    owner: "owner",
  };
  return map[role] ?? "regionalRm";
}

function mapDbRegion(region: string | null): SessionUser["region"] {
  if (!region) return null;
  const map: Record<string, SessionUser["region"]> = {
    north: "north",
    east: "east",
    west: "west",
    south: "south",
  };
  return map[region] ?? null;
}

export async function signIn(
  email: string,
  password: string
): Promise<{ ok: true; redirect: string } | { ok: false; error: string }> {
  if (USE_MOCK) {
    const user = mockUsers.find((u) => u.email === email.toLowerCase());
    if (!user || password !== "demo1234") {
      return { ok: false, error: "Invalid email or password" };
    }
    const role = user.role;
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role,
      name: user.name,
      region: user.region,
    };
    const access = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(ACCESS_TTL)
      .sign(getSecret());
    const refresh = await new SignJWT({ userId: user.id })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(REFRESH_TTL)
      .sign(getRefreshSecret());
    const cookieStore = await cookies();
    const secure = process.env.NODE_ENV === "production";
    cookieStore.set(ACCESS_COOKIE, access, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    cookieStore.set(REFRESH_COOKIE, refresh, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return { ok: true, redirect: ROLE_HOME[role] };
  }

  let rows: User[];
  try {
    rows = await sql<(User & { regions?: string[] })[]>`
      SELECT id, email, password_hash AS "passwordHash", name, role, region, regions, active
      FROM staff WHERE email = ${email.toLowerCase()} AND active = true LIMIT 1
    `;
  } catch (e) {
    if (isDbConnectionError(e)) {
      return { ok: false, error: "Could not reach the database. Try again in a moment." };
    }
    const message = e instanceof Error ? e.message : "Database unavailable";
    console.error("signIn staff lookup:", message);
    return { ok: false, error: "Could not reach the database. Try again in a moment." };
  }
  const user = rows[0];
  if (!user?.passwordHash) {
    return { ok: false, error: "Invalid email or password" };
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { ok: false, error: "Invalid email or password" };
  }

  const role = mapDbRole(user.role as unknown as string);
  const region = mapDbRegion(user.region as unknown as string | null);
  const regions = (user.regions ?? [])
    .map((r) => mapDbRegion(r))
    .filter((r): r is NonNullable<typeof r> => r != null);
  const payload: TokenPayload & { regions?: string[] } = {
    userId: user.id,
    email: user.email,
    role,
    name: user.name,
    region: region ?? regions[0] ?? null,
    regions: regions.length ? regions : region ? [region] : [],
  };

  const access = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(getSecret());

  const refresh = await new SignJWT({ userId: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TTL)
    .sign(getRefreshSecret());

  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";
  cookieStore.set(ACCESS_COOKIE, access, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  cookieStore.set(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return { ok: true, redirect: ROLE_HOME[role] };
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_COOKIE);
  cookieStore.delete(REFRESH_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as UserRole;
    const email =
      typeof payload.email === "string" ? payload.email.toLowerCase() : null;

    if (!USE_MOCK) {
      const userId = payload.userId as string;
      // Trust JWT when it has a real staff UUID (set at login from DB)
      if (UUID_RE.test(userId)) {
        return {
          userId,
          role,
          name: payload.name as string,
          region: (payload.region as SessionUser["region"]) ?? null,
          regions: (payload.regions as SessionUser["regions"]) ?? undefined,
        };
      }
      // Legacy mock tokens (e.g. u-kanika) — resolve once by email if present
      if (email) {
        const row = await safeDbQuery(
          async () => {
            const [r] = await sql<
              { id: string; name: string; role: string; region: string | null }[]
            >`
              SELECT id, name, role, region FROM staff
              WHERE email = ${email} AND active = true
              LIMIT 1
            `;
            return r ?? null;
          },
          null,
          "getSession.legacyLookup",
        );
        if (row) {
          const regions = (row as { regions?: string[] }).regions
            ?.map((r) => mapDbRegion(r))
            .filter((r): r is NonNullable<typeof r> => r != null) ?? [];
          const region = mapDbRegion(row.region);
          return {
            userId: row.id,
            role: mapDbRole(row.role),
            name: row.name,
            region: region ?? regions[0] ?? null,
            regions: regions.length ? regions : region ? [region] : [],
          };
        }
      }
      return null;
    }

    return {
      userId: payload.userId as string,
      role,
      name: payload.name as string,
      region: (payload.region as SessionUser["region"]) ?? null,
    };
  } catch {
    return null;
  }
}

export function getRoleHome(role: UserRole): string {
  return ROLE_HOME[role];
}
