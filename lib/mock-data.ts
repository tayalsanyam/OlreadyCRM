import type { User } from "./types";

const now = new Date().toISOString();

/** Demo users — password: demo1234 */
export const mockUsers: User[] = [
  { id: "u-kanika", email: "kanika@olready.in", name: "Kanika", role: "regionalRm", region: "north", active: true, createdAt: now, updatedAt: now },
  { id: "u-rm-north", email: "rm.north@olready.in", name: "Priya Sharma", role: "regionalRm", region: "north", active: true, createdAt: now, updatedAt: now },
  { id: "u-commission", email: "commission@olready.in", name: "Rahul Mehta", role: "commissionRm", region: null, active: true, createdAt: now, updatedAt: now },
  { id: "u-commission-2", email: "commission2@olready.in", name: "Sneha Verma", role: "commissionRm", region: null, active: true, createdAt: now, updatedAt: now },
  { id: "u-uploader", email: "uploader@olready.in", name: "Anita Desai", role: "leadUploader", region: null, active: true, createdAt: now, updatedAt: now },
  { id: "u-feedback", email: "feedback@olready.in", name: "Neha Gupta", role: "feedbackRm", region: null, active: true, createdAt: now, updatedAt: now },
  { id: "u-care", email: "care@olready.in", name: "Priya Sharma", role: "careAgent", region: null, active: true, createdAt: now, updatedAt: now },
  { id: "u-admin", email: "admin@olready.in", name: "Vikram Singh", role: "admin", region: null, active: true, createdAt: now, updatedAt: now },
  { id: "u-owner", email: "owner@olready.in", name: "Sanya Kapoor", role: "owner", region: null, active: true, createdAt: now, updatedAt: now },
];

export const USE_MOCK = process.env.USE_MOCK_DATA === "true";
