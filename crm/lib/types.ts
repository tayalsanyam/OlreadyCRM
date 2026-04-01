export const STATUSES = [
  "UNTOUCHED",
  "CONTACTED",
  "FOLLOW UP/DETAILS SHARED",
  "CONFIRMED",
  "PARTLY_PAID",
  "PAID",
  "DENIED",
] as const;

export const PAYMENT_MODES = ["CASH", "BANK", "UPI", "CREDIT_CARD", "PAYMENT_LINK"] as const;
export const PAYMENT_STATUSES = ["PENDING", "PARTIAL", "COMPLETE"] as const;

export type Status = (typeof STATUSES)[number];
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface Lead {
  id: string;
  name: string;
  city: string;
  company?: string;
  active?: boolean;
  email?: string;
  phone?: string;
  insta_id?: string;
  bdm: string;
  plan: string;
  status: Status | string;
  source?: string;
  remarks?: string;
  connected_on?: string;
  next_follow_up?: string;
  committed_date?: string;
  original_price?: number;
  discount?: number;
  amount_paid?: number;
  amount_balance?: number;
  payment_status?: PaymentStatus | string;
  payment_mode?: PaymentMode | string;
  if_part?: boolean;
  created_at: string;
  last_modified?: string;
  lost_reason?: string;
}

export interface Activity {
  id: string;
  lead_id: string;
  date: string;
  time?: string;
  action: string;
  user?: string;
  notes?: string;
  status?: string;
  remarks?: string;
  next_connect?: string;
}

export interface Task {
  id: string;
  title: string;
  due: string;
  assignee: string;
  done: boolean;
  lead_id?: string;
  renewal_deal_id?: string;
}

export interface BDMLogEntry {
  id: string;
  bdm: string;
  date: string;
  total_calls: number;
  connected_calls: number;
  non_answered_calls: number;
  talk_time: number;
}

export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: "admin" | "team_leader" | "bdm";
  assigned_bdm?: string;
  team_id?: string;
  email?: string;
}

export interface Team {
  team_id: string;
  team_name: string;
  bdm: string;
}
