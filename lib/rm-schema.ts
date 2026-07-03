/**
 * RM platform lives in Postgres schema `rm` — isolated from legacy public BDM tables (removed).
 * Optional opaque link: rm.muas.public_lead_id (text, external CRM id if needed).
 */
export const RM_SCHEMA = "rm";

/** Set on every connection so unqualified table names resolve to rm.* */
export const RM_SEARCH_PATH_SQL = "SET search_path TO rm";
