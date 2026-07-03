/** PostgreSQL comm_entry_type enum values */
export const COMM = {
  leadCreated: "lead_created",
  leadVerified: "lead_verified",
  assigned: "assigned",
  muaPushed: "mua_pushed",
  stageUpdated: "stage_updated",
  capBypass: "cap_bypass",
  callLogged: "call_logged",
  whatsappLogged: "whatsapp_logged",
  shiftedCommission: "shifted_commission",
  hostileFlagged: "hostile_flagged",
  closeConfirmation: "close_confirmation",
  conversationClosed: "conversation_closed",
  bookingConfirmed: "booking_confirmed",
  softCheckin: "soft_checkin",
  note: "note",
  callyzerSynced: "callyzer_synced",
  careTicketCreated: "care_ticket_created",
  careEmailSent: "care_email_sent",
  careCallbackLogged: "care_callback_logged",
  careTaskCompleted: "care_task_completed",
  careWhatsappLogged: "care_whatsapp_logged",
  careEscalation: "care_escalation",
} as const;

export type CommDbType = (typeof COMM)[keyof typeof COMM];
