"use client";

export async function logSalesWhatsApp(params: {
  pipelineId: string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const res = await fetch(`/api/sales/pipeline/${params.pipelineId}/comms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entryType: "whatsappLogged",
      description: params.description,
      metadata: params.metadata ?? {},
    }),
  });
  return res.ok;
}

export async function logLeadWhatsApp(params: {
  leadId: string;
  description: string;
  muaId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const res = await fetch(`/api/leads/${params.leadId}/comms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "whatsapp",
      description: params.description,
      muaId: params.muaId ?? undefined,
      metadata: params.metadata ?? {},
    }),
  });
  return res.ok;
}

export async function logCareWhatsApp(params: {
  ticketId: string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  try {
    const res = await fetch(`/api/crm/tickets/${params.ticketId}/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: params.description,
        metadata: params.metadata ?? {},
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
