import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionUser {
  id: string;
  username: string;
  role: "admin" | "team_leader" | "bdm";
  assigned_bdm?: string;
  team_id?: string;
}

export interface SessionData {
  user?: SessionUser;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET || "olready-crm-session-secret-min-32-chars!!",
  cookieName: "olready_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax" as const,
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export function requireAdmin(session: SessionData): boolean {
  return session.user?.role === "admin";
}

export function getLeadFilterBdms(session: SessionData): string[] | null {
  if (!session.user) return null;
  if (session.user.role === "admin") return null; // all
  if (session.user.role === "bdm" && session.user.assigned_bdm)
    return [session.user.assigned_bdm];
  if (session.user.role === "team_leader" && session.user.team_id) return null; // filtered by team in query
  return null;
}
