import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(__dirname, "../db/schema-rm.sql"), "utf8");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const sep = url.includes("?") ? "&" : "?";
const sql = postgres(
  url.includes("search_path") ? url : `${url}${sep}options=-c%20search_path%3Drm`
);

const incremental = readFileSync(
  join(__dirname, "../db/migrations/002_mua_enhancements.sql"),
  "utf8"
);

const commsMuaId = `
ALTER TABLE rm.comms ADD COLUMN IF NOT EXISTS mua_id UUID REFERENCES rm.muas(id);
CREATE INDEX IF NOT EXISTS idx_comms_mua_id ON rm.comms(mua_id);
`;

try {
  try {
    await sql.unsafe(schema);
    console.log("RM base schema applied");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exists")) {
      console.log("RM base schema already present — applying incremental only");
    } else {
      throw err;
    }
  }
  try {
    await sql.unsafe(commsMuaId);
    console.log("comms.mua_id OK");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("already exists")) console.warn("comms.mua_id:", msg);
  }
  await sql.unsafe(incremental);
  console.log("RM migration 002_mua_enhancements applied");

  const batch003 = readFileSync(
    join(__dirname, "../db/migrations/003_feature_batch.sql"),
    "utf8"
  );
  await sql.unsafe(batch003);
  console.log("RM migration 003_feature_batch applied");

  const batch004 = readFileSync(
    join(__dirname, "../db/migrations/004_recreate_leads_full_view.sql"),
    "utf8"
  );
  await sql.unsafe(batch004);
  console.log("RM migration 004_recreate_leads_full_view applied");

  const eventBudgets = readFileSync(
    join(__dirname, "../db/migrations/004_event_budgets.sql"),
    "utf8"
  );
  await sql.unsafe(eventBudgets);
  console.log("RM migration 004_event_budgets applied");

  const targets = readFileSync(
    join(__dirname, "../db/migrations/005_targets.sql"),
    "utf8"
  );
  await sql.unsafe(targets);
  console.log("RM migration 005_targets applied");

  const queueColumns = readFileSync(
    join(__dirname, "../db/migrations/006_leads_full_queue_columns.sql"),
    "utf8"
  );
  await sql.unsafe(queueColumns);
  console.log("RM migration 006_leads_full_queue_columns applied");

  const bookingStatus = readFileSync(
    join(__dirname, "../db/migrations/007_leads_full_booking_status.sql"),
    "utf8"
  );
  await sql.unsafe(bookingStatus);
  console.log("RM migration 007_leads_full_booking_status applied");

  const muaNames = readFileSync(
    join(__dirname, "../db/migrations/008_leads_full_mua_names.sql"),
    "utf8"
  );
  await sql.unsafe(muaNames);
  console.log("RM migration 008_leads_full_mua_names applied");

  const pushOutcome = readFileSync(
    join(__dirname, "../db/migrations/009_push_outcome_not_interested.sql"),
    "utf8"
  );
  await sql.unsafe(pushOutcome);
  console.log("RM migration 009_push_outcome_not_interested applied");

  const muaRegion = readFileSync(
    join(__dirname, "../db/migrations/010_mua_region.sql"),
    "utf8"
  );
  await sql.unsafe(muaRegion);
  console.log("RM migration 010_mua_region applied");

  const muaRegionsMulti = readFileSync(
    join(__dirname, "../db/migrations/011_mua_regions_and_profile.sql"),
    "utf8"
  );
  await sql.unsafe(muaRegionsMulti);
  console.log("RM migration 011_mua_regions_and_profile applied");

  const commissionFollowUp = readFileSync(
    join(__dirname, "../db/migrations/012_commission_follow_up.sql"),
    "utf8"
  );
  await sql.unsafe(commissionFollowUp);
  console.log("RM migration 012_commission_follow_up applied");

  const leadsFullCommission = readFileSync(
    join(__dirname, "../db/migrations/013_recreate_leads_full_commission.sql"),
    "utf8"
  );
  await sql.unsafe(leadsFullCommission);
  console.log("RM migration 013_recreate_leads_full_commission applied");

  const queueIndexes = readFileSync(
    join(__dirname, "../db/migrations/014_queue_indexes.sql"),
    "utf8"
  );
  await sql.unsafe(queueIndexes);
  console.log("RM migration 014_queue_indexes applied");

  const batch015 = readFileSync(
    join(__dirname, "../db/migrations/015_cursor_prompts_batch.sql"),
    "utf8"
  );
  await sql.unsafe(batch015);
  console.log("RM migration 015_cursor_prompts_batch applied");

  const batch016 = readFileSync(
    join(__dirname, "../db/migrations/016_leads_full_sla_event_date.sql"),
    "utf8"
  );
  await sql.unsafe(batch016);
  console.log("RM migration 016_leads_full_sla_event_date applied");

  const batch017 = readFileSync(
    join(__dirname, "../db/migrations/017_plan_tier_privy_display_name.sql"),
    "utf8"
  );
  await sql.unsafe(batch017);
  console.log("RM migration 017_plan_tier_privy_display_name applied");

  const batch018 = readFileSync(
    join(__dirname, "../db/migrations/018_lead_exit_uploader_confirmation.sql"),
    "utf8"
  );
  await sql.unsafe(batch018);
  console.log("RM migration 018_lead_exit_uploader_confirmation applied");

  const batch019 = readFileSync(
    join(__dirname, "../db/migrations/019_lead_exit_marked_by_role.sql"),
    "utf8"
  );
  await sql.unsafe(batch019);
  console.log("RM migration 019_lead_exit_marked_by_role applied");

  const batch020 = readFileSync(
    join(__dirname, "../db/migrations/020_bride_leads_event_date_nullable.sql"),
    "utf8"
  );
  await sql.unsafe(batch020);
  console.log("RM migration 020_bride_leads_event_date_nullable applied");

  const batch021 = readFileSync(
    join(__dirname, "../db/migrations/021_lead_events_location_region.sql"),
    "utf8"
  );
  await sql.unsafe(batch021);
  console.log("RM migration 021_lead_events_location_region applied");

  const batch022 = readFileSync(
    join(__dirname, "../db/migrations/022_booking_payment_mode.sql"),
    "utf8"
  );
  await sql.unsafe(batch022);
  console.log("RM migration 022_booking_payment_mode applied");

  const batch023 = readFileSync(
    join(__dirname, "../db/migrations/023_booking_commission.sql"),
    "utf8"
  );
  await sql.unsafe(batch023);
  console.log("RM migration 023_booking_commission applied");

  const batch024 = readFileSync(
    join(__dirname, "../db/migrations/024_budget_tier_limits.sql"),
    "utf8"
  );
  await sql.unsafe(batch024);
  console.log("RM migration 024_budget_tier_limits applied");

  const batch025 = readFileSync(
    join(__dirname, "../db/migrations/025_feedback_role.sql"),
    "utf8"
  );
  await sql.unsafe(batch025);
  console.log("RM migration 025_feedback_role applied");

  const batch026 = readFileSync(
    join(__dirname, "../db/migrations/026_sales_foundation.sql"),
    "utf8"
  );
  await sql.unsafe(batch026);
  console.log("RM migration 026_sales_foundation applied");

  const batch027 = readFileSync(
    join(__dirname, "../db/migrations/027_custom_report_templates.sql"),
    "utf8"
  );
  await sql.unsafe(batch027);
  console.log("RM migration 027_custom_report_templates applied");

  const batch028 = readFileSync(
    join(__dirname, "../db/migrations/028_sales_pipeline_priority_tag.sql"),
    "utf8"
  );
  await sql.unsafe(batch028);
  console.log("RM migration 028_sales_pipeline_priority_tag applied");

  const batch029 = readFileSync(
    join(__dirname, "../db/migrations/029_audit_log_triggers.sql"),
    "utf8"
  );
  await sql.unsafe(batch029);
  console.log("RM migration 029_audit_log_triggers applied");

  const batch030 = readFileSync(
    join(__dirname, "../db/migrations/030_sales_crm_phase2.sql"),
    "utf8"
  );
  await sql.unsafe(batch030);
  console.log("RM migration 030_sales_crm_phase2 applied");

  const batch031 = readFileSync(
    join(__dirname, "../db/migrations/031_sales_stage_plan_fields.sql"),
    "utf8"
  );
  await sql.unsafe(batch031);
  console.log("RM migration 031_sales_stage_plan_fields applied");

  const batch032 = readFileSync(
    join(__dirname, "../db/migrations/032_sales_pipeline_junk_rejected.sql"),
    "utf8"
  );
  await sql.unsafe(batch032);
  console.log("RM migration 032_sales_pipeline_junk_rejected applied");

  const batch033 = readFileSync(
    join(__dirname, "../db/migrations/033_sales_renewal_track.sql"),
    "utf8"
  );
  await sql.unsafe(batch033);
  console.log("RM migration 033_sales_renewal_track applied");

  const batch034 = readFileSync(
    join(__dirname, "../db/migrations/034_pipeline_renewal_mua_type.sql"),
    "utf8"
  );
  await sql.unsafe(batch034);
  console.log("RM migration 034_pipeline_renewal_mua_type applied");

  const batch035 = readFileSync(
    join(__dirname, "../db/migrations/035_pipeline_rejection_log.sql"),
    "utf8"
  );
  await sql.unsafe(batch035);
  console.log("RM migration 035_pipeline_rejection_log applied");

  const batch036 = readFileSync(
    join(__dirname, "../db/migrations/036_mua_service_catalog_profile.sql"),
    "utf8"
  );
  await sql.unsafe(batch036);
  console.log("RM migration 036_mua_service_catalog_profile applied");

  const batch037 = readFileSync(
    join(__dirname, "../db/migrations/037_mua_active_pipeline_bootstrap.sql"),
    "utf8"
  );
  await sql.unsafe(batch037);
  console.log("RM migration 037_mua_active_pipeline_bootstrap applied");

  const batch038 = readFileSync(
    join(__dirname, "../db/migrations/038_city_states.sql"),
    "utf8"
  );
  await sql.unsafe(batch038);
  console.log("RM migration 038_city_states applied");

  const batch039 = readFileSync(
    join(__dirname, "../db/migrations/039_whatsapp_config.sql"),
    "utf8"
  );
  await sql.unsafe(batch039);
  console.log("RM migration 039_whatsapp_config applied");

  const batch040 = readFileSync(
    join(__dirname, "../db/migrations/040_bride_makeup_look_profiles.sql"),
    "utf8"
  );
  await sql.unsafe(batch040);
  console.log("RM migration 040_bride_makeup_look_profiles applied");

  const batch041 = readFileSync(
    join(__dirname, "../db/migrations/041_makeup_per_event_looks.sql"),
    "utf8"
  );
  await sql.unsafe(batch041);
  console.log("RM migration 041_makeup_per_event_looks applied");

  const batch042 = readFileSync(
    join(__dirname, "../db/migrations/042_callyzer_org_wide.sql"),
    "utf8"
  );
  await sql.unsafe(batch042);
  console.log("RM migration 042_callyzer_org_wide applied");

  const batch043 = readFileSync(
    join(__dirname, "../db/migrations/043_support_grievances.sql"),
    "utf8"
  );
  await sql.unsafe(batch043);
  console.log("RM migration 043_support_grievances applied");

  const batch044 = readFileSync(
    join(__dirname, "../db/migrations/044_support_updated_at_columns.sql"),
    "utf8"
  );
  await sql.unsafe(batch044);
  console.log("RM migration 044_support_updated_at_columns applied");

  const batch045 = readFileSync(
    join(__dirname, "../db/migrations/045_ticket_email_attachments.sql"),
    "utf8"
  );
  await sql.unsafe(batch045);
  console.log("RM migration 045_ticket_email_attachments applied");

  const batch046 = readFileSync(
    join(__dirname, "../db/migrations/046_support_public_chat.sql"),
    "utf8"
  );
  await sql.unsafe(batch046);
  console.log("RM migration 046_support_public_chat applied");

  const batch047 = readFileSync(
    join(__dirname, "../db/migrations/047_ai_domain_overrides_plan_pricing.sql"),
    "utf8"
  );
  await sql.unsafe(batch047);
  console.log("RM migration 047_ai_domain_overrides_plan_pricing applied");

  const batch048 = readFileSync(
    join(__dirname, "../db/migrations/048_support_inquiries.sql"),
    "utf8"
  );
  await sql.unsafe(batch048);
  console.log("RM migration 048_support_inquiries applied");

  const batch049 = readFileSync(
    join(__dirname, "../db/migrations/049_support_inquiry_assignment.sql"),
    "utf8"
  );
  await sql.unsafe(batch049);
  console.log("RM migration 049_support_inquiry_assignment applied");

  const batch050 = readFileSync(
    join(__dirname, "../db/migrations/050_ops_tasks.sql"),
    "utf8"
  );
  await sql.unsafe(batch050);
  console.log("RM migration 050_ops_tasks applied");

  const batch051 = readFileSync(
    join(__dirname, "../db/migrations/051_drop_legacy_public_harden_rls.sql"),
    "utf8"
  );
  await sql.unsafe(batch051);
  console.log("RM migration 051_drop_legacy_public_harden_rls applied");

  const batch052 = readFileSync(
    join(__dirname, "../db/migrations/052_public_chat_reply_source.sql"),
    "utf8"
  );
  await sql.unsafe(batch052);
  console.log("RM migration 052_public_chat_reply_source applied");

  const batch053 = readFileSync(
    join(__dirname, "../db/migrations/053_ticket_correspondence.sql"),
    "utf8"
  );
  await sql.unsafe(batch053);
  console.log("RM migration 053_ticket_correspondence applied");

  const batch054 = readFileSync(
    join(__dirname, "../db/migrations/054_ticket_workflow_comms_updates.sql"),
    "utf8"
  );
  await sql.unsafe(batch054);
  console.log("RM migration 054_ticket_workflow_comms_updates applied");

  const batch055 = readFileSync(
    join(__dirname, "../db/migrations/055_lead_makeup_reference_images.sql"),
    "utf8"
  );
  await sql.unsafe(batch055);
  console.log("RM migration 055_lead_makeup_reference_images applied");

  const batch056 = readFileSync(
    join(__dirname, "../db/migrations/056_mua_admin_plan_controls.sql"),
    "utf8"
  );
  await sql.unsafe(batch056);
  console.log("RM migration 056_mua_admin_plan_controls applied");

  const batch057 = readFileSync(
    join(__dirname, "../db/migrations/057_mua_plan_coverage.sql"),
    "utf8"
  );
  await sql.unsafe(batch057);
  console.log("RM migration 057_mua_plan_coverage applied");

  const batch058 = readFileSync(
    join(__dirname, "../db/migrations/058_delhi_ncr_cities.sql"),
    "utf8"
  );
  await sql.unsafe(batch058);
  console.log("RM migration 058_delhi_ncr_cities applied");

  const batch059 = readFileSync(
    join(__dirname, "../db/migrations/059_backfill_active_mua_sales_pipelines.sql"),
    "utf8"
  );
  await sql.unsafe(batch059);
  console.log("RM migration 059_backfill_active_mua_sales_pipelines applied");

  const batch060 = readFileSync(
    join(__dirname, "../db/migrations/060_ops_task_attachments.sql"),
    "utf8"
  );
  await sql.unsafe(batch060);
  console.log("RM migration 060_ops_task_attachments applied");

  const batch061 = readFileSync(
    join(__dirname, "../db/migrations/061_per_lead_cap_default.sql"),
    "utf8"
  );
  await sql.unsafe(batch061);
  console.log("RM migration 061_per_lead_cap_default applied");

  const batch062 = readFileSync(
    join(__dirname, "../db/migrations/062_commission_collection_sla.sql"),
    "utf8"
  );
  await sql.unsafe(batch062);
  console.log("RM migration 062_commission_collection_sla applied");

  const batch063 = readFileSync(
    join(__dirname, "../db/migrations/063_feedback_referrals_ratings.sql"),
    "utf8"
  );
  await sql.unsafe(batch063);
  console.log("RM migration 063_feedback_referrals_ratings applied");

  const batch064 = readFileSync(
    join(__dirname, "../db/migrations/064_feedback_referral_intake.sql"),
    "utf8"
  );
  await sql.unsafe(batch064);
  console.log("RM migration 064_feedback_referral_intake applied");

  const batch065 = readFileSync(
    join(__dirname, "../db/migrations/065_feedback_closed_no_contact.sql"),
    "utf8"
  );
  await sql.unsafe(batch065);
  console.log("RM migration 065_feedback_closed_no_contact applied");

  const batch066 = readFileSync(
    join(__dirname, "../db/migrations/066_feedback_service_notes.sql"),
    "utf8"
  );
  await sql.unsafe(batch066);
  console.log("RM migration 066_feedback_service_notes applied");

  const batch067 = readFileSync(
    join(__dirname, "../db/migrations/067_mua_portfolio_work.sql"),
    "utf8"
  );
  await sql.unsafe(batch067);
  console.log("RM migration 067_mua_portfolio_work applied");

  const batch068 = readFileSync(
    join(__dirname, "../db/migrations/068_bride_grievance_categories.sql"),
    "utf8"
  );
  await sql.unsafe(batch068);
  console.log("RM migration 068_bride_grievance_categories applied");

  const batch069 = readFileSync(
    join(__dirname, "../db/migrations/069_backfill_mua_sales_closed_by.sql"),
    "utf8"
  );
  await sql.unsafe(batch069);
  console.log("RM migration 069_backfill_mua_sales_closed_by applied");

  const batch070 = readFileSync(
    join(__dirname, "../db/migrations/070_stage_log_metadata.sql"),
    "utf8"
  );
  await sql.unsafe(batch070);
  console.log("RM migration 070_stage_log_metadata applied");

  const batch071 = readFileSync(
    join(__dirname, "../db/migrations/071_pipeline_post_close_active.sql"),
    "utf8"
  );
  await sql.unsafe(batch071);
  console.log("RM migration 071_pipeline_post_close_active applied");

  const batch072 = readFileSync(
    join(__dirname, "../db/migrations/072_fix_quoted_amount_part_payment.sql"),
    "utf8"
  );
  await sql.unsafe(batch072);
  console.log("RM migration 072_fix_quoted_amount_part_payment applied");

  const batch073 = readFileSync(
    join(__dirname, "../db/migrations/073_onboarding_pipeline_stage.sql"),
    "utf8"
  );
  await sql.unsafe(batch073);
  console.log("RM migration 073_onboarding_pipeline_stage applied");

  const batch074 = readFileSync(
    join(__dirname, "../db/migrations/074_onboarding_deal_confirm_fields.sql"),
    "utf8"
  );
  await sql.unsafe(batch074);
  console.log("RM migration 074_onboarding_deal_confirm_fields applied");

  const batch075 = readFileSync(
    join(__dirname, "../db/migrations/075_complete_stuck_onboarding_tasks.sql"),
    "utf8"
  );
  await sql.unsafe(batch075);
  console.log("RM migration 075_complete_stuck_onboarding_tasks applied");

  const batch076 = readFileSync(
    join(__dirname, "../db/migrations/076_delhi_ncr_bundle_geo.sql"),
    "utf8"
  );
  await sql.unsafe(batch076);
  console.log("RM migration 076_delhi_ncr_bundle_geo applied");

  const batch077 = readFileSync(
    join(__dirname, "../db/migrations/077_chandigarh_tricity_bundle.sql"),
    "utf8"
  );
  await sql.unsafe(batch077);
  console.log("RM migration 077_chandigarh_tricity_bundle applied");

  const batch078 = readFileSync(
    join(__dirname, "../db/migrations/078_homonym_ut_cities.sql"),
    "utf8"
  );
  await sql.unsafe(batch078);
  console.log("RM migration 078_homonym_ut_cities applied");

  const batch079 = readFileSync(
    join(__dirname, "../db/migrations/079_bride_leads_region_nullable.sql"),
    "utf8"
  );
  await sql.unsafe(batch079);
  console.log("RM migration 079_bride_leads_region_nullable applied");

  const batch080 = readFileSync(
    join(__dirname, "../db/migrations/080_rm_lead_intake_task_types.sql"),
    "utf8"
  );
  await sql.unsafe(batch080);
  console.log("RM migration 080_rm_lead_intake_task_types applied");

  const batch081 = readFileSync(
    join(__dirname, "../db/migrations/081_rm_lead_intake_workflow.sql"),
    "utf8"
  );
  await sql.unsafe(batch081);
  console.log("RM migration 081_rm_lead_intake_workflow applied");

  const batch082 = readFileSync(
    join(__dirname, "../db/migrations/082_recreate_leads_full_intake.sql"),
    "utf8"
  );
  await sql.unsafe(batch082);
  console.log("RM migration 082_recreate_leads_full_intake applied");

  const batch083 = readFileSync(
    join(__dirname, "../db/migrations/083_mua_plan_rm.sql"),
    "utf8"
  );
  await sql.unsafe(batch083);
  console.log("RM migration 083_mua_plan_rm applied");

  const batch084 = readFileSync(
    join(__dirname, "../db/migrations/084_callyzer_sync_state.sql"),
    "utf8"
  );
  await sql.unsafe(batch084);
  console.log("RM migration 084_callyzer_sync_state applied");

  const batch085 = readFileSync(
    join(__dirname, "../db/migrations/085_day_end_checkouts.sql"),
    "utf8"
  );
  await sql.unsafe(batch085);
  console.log("RM migration 085_day_end_checkouts applied");

  const batch086 = readFileSync(
    join(__dirname, "../db/migrations/086_rm_targets_commission.sql"),
    "utf8"
  );
  await sql.unsafe(batch086);
  console.log("RM migration 086_rm_targets_commission applied");

  const batch087 = readFileSync(
    join(__dirname, "../db/migrations/087_ticket_email_send_channel.sql"),
    "utf8"
  );
  await sql.unsafe(batch087);
  console.log("RM migration 087_ticket_email_send_channel applied");

  const batch088 = readFileSync(
    join(__dirname, "../db/migrations/088_ticket_email_template_samples.sql"),
    "utf8"
  );
  await sql.unsafe(batch088);
  console.log("RM migration 088_ticket_email_template_samples applied");

  const batch097 = readFileSync(
    join(__dirname, "../db/migrations/097_rename_lapsed_to_re_engage.sql"),
    "utf8"
  );
  await sql.unsafe(batch097);
  console.log("Migration 097_rename_lapsed_to_re_engage applied");

  const batch105 = readFileSync(
    join(__dirname, "../db/migrations/105_rm_mua_push_email_templates.sql"),
    "utf8"
  );
  await sql.unsafe(batch105);
  console.log("RM migration 105_rm_mua_push_email_templates applied");
} finally {
  await sql.end();
}
