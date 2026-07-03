import type { Region, UserRole } from "@/lib/types";

/** Shared with login quick-access buttons — keep in sync. */
export const DEMO_PASSWORD = "demo1234";

export type DemoUserSeed = {
  /** Button label on /login */
  label: string;
  email: string;
  name: string;
  role: UserRole;
  region: Region | null;
  /** Demo Callyzer-tracked mobile (10 digits). */
  callyzerNumber?: string;
};

export const DEMO_USERS: DemoUserSeed[] = [
  { label: "Regional RM", email: "kanika@olready.in", name: "Kanika", role: "regionalRm", region: "north", callyzerNumber: "9811000001" },
  { label: "Commission RM", email: "commission@olready.in", name: "Rahul Mehta", role: "commissionRm", region: null, callyzerNumber: "9811000002" },
  { label: "Lead Uploader", email: "uploader@olready.in", name: "Anita Desai", role: "leadUploader", region: null, callyzerNumber: "9811000003" },
  { label: "Feedback", email: "feedback@olready.in", name: "Neha Gupta", role: "feedbackRm", region: null, callyzerNumber: "9811000004" },
  { label: "Care Agent", email: "care@olready.in", name: "Priya Sharma", role: "careAgent", region: null, callyzerNumber: "9811000008" },
  { label: "Sales RM", email: "sales.rm@olready.in", name: "Aarav Khanna", role: "salesRm", region: null, callyzerNumber: "9811000005" },
  { label: "Sales TL", email: "sales.tl@olready.in", name: "Ishita Verma", role: "salesTl", region: null, callyzerNumber: "9811000006" },
  { label: "Activation", email: "activation@olready.in", name: "Rohan Bedi", role: "salesActivation", region: null, callyzerNumber: "9811000007" },
  { label: "Admin", email: "admin@olready.in", name: "Vikram Singh", role: "admin", region: null },
  { label: "Owner", email: "owner@olready.in", name: "Sanya Kapoor", role: "owner", region: null },
];

/** Map app UserRole → Postgres rm.user_role enum slug. */
export const DEMO_USER_ROLE_DB: Record<UserRole, string> = {
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
