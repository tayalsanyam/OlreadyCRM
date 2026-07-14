"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SlideOver } from "@/components/ui/SlideOver";
import { CreateTicketForm } from "@/components/grievances/CreateTicketForm";
import type { RaisedByType } from "@/lib/types";

type Props = {
  context: "mua" | "bride";
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
  muaId?: string;
  muaName?: string;
  muaPhone?: string | null;
  muaEmail?: string | null;
  leadId?: string;
  brideName?: string;
  bridePhone?: string | null;
  brideEmail?: string | null;
};

export function FeedbackRaiseCareTicketButton({
  context,
  label = "Raise care ticket",
  size = "sm",
  variant = "secondary",
  muaId,
  muaName,
  muaPhone,
  muaEmail,
  leadId,
  brideName,
  bridePhone,
  brideEmail,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const raisedByType: RaisedByType = context === "bride" ? "bride" : "mua";
  const contactName = context === "bride" ? brideName : muaName;
  const contactPhone = context === "bride" ? bridePhone : muaPhone;
  const contactEmail = context === "bride" ? brideEmail : muaEmail;

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <SlideOver open={open} onClose={() => setOpen(false)} title="Raise care ticket">
        <div className="p-4">
          <p className="mb-4 text-sm text-slate-muted">
            {context === "bride"
              ? `Hand off a bride-side issue from ${contactName ?? "this lead"} to the care team.`
              : `Hand off an MUA-side issue for ${contactName ?? "this artist"} to the care team.`}
          </p>
          <CreateTicketForm
            initialMuaId={context === "mua" ? muaId : undefined}
            initialLeadId={context === "bride" ? leadId : undefined}
            initialRaisedByType={raisedByType}
            initialName={contactName ?? ""}
            initialPhone={contactPhone}
            initialEmail={contactEmail}
            sendAck={false}
            submitLabel="Create & view ticket"
            onCreated={(ticket) => {
              setOpen(false);
              router.push(`/feedback/grievances/${ticket.id}`);
            }}
            onCancel={() => setOpen(false)}
          />
        </div>
      </SlideOver>
    </>
  );
}

/** @deprecated Use FeedbackRaiseCareTicketButton */
export const FeedbackCreateCareTicketButton = FeedbackRaiseCareTicketButton;
